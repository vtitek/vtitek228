// order_hunter — собирает свежие заказы из RSS-лент бирж и публичных Telegram-каналов,
// вытаскивает из них контакты заказчика и строит orders.html с кнопками «Написать».
//
// Сборка:   g++ -std=c++17 -O2 order_hunter.cpp -o order_hunter
// Нужен curl в PATH (в Windows 10+ и macOS есть из коробки, в Linux: apt install curl).
//
// Запуск:   ./order_hunter                      — один проход по источникам
//           ./order_hunter --watch 10           — проверять каждые 10 минут
//           ./order_hunter --all                — показывать и уже виденные заказы
//           ./order_hunter -k сайт -k лендинг   — фильтр по ключевым словам (любое из)
//           ./order_hunter --sources my.txt     — свой список источников
//
// Формат файла источников (по одному на строку, # — комментарий):
//   rss https://www.fl.ru/rss/all.xml
//   tg  webfrl                 (username публичного канала, читается через t.me/s/)

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <ctime>
#include <fstream>
#include <iostream>
#include <regex>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#define popen _popen
#define pclose _pclose
#endif

using namespace std;

struct Source { string type, target; };

struct Contact { string kind, value, url; };

struct Order {
    string source, title, text, link, date, id;
    vector<Contact> contacts;
};

// ---------- утилиты ----------

static string fetch(const string& url) {
    // URL берётся только из файла источников; кавычки вырезаем, чтобы не сломать командную строку.
    string safe;
    for (char c : url) if (c != '"' && c != '\'' && c != '`' && c != '$' && c != '\\') safe += c;
    string cmd = "curl -s -L --compressed --max-time 25 -A \"Mozilla/5.0 (OrderHunter)\" \"" + safe + "\"";
    FILE* p = popen(cmd.c_str(), "r");
    if (!p) return "";
    string out;
    char buf[65536];
    size_t n;
    while ((n = fread(buf, 1, sizeof buf, p)) > 0) out.append(buf, n);
    pclose(p);
    return out;
}

static string trim(const string& s) {
    size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
    return a == string::npos ? "" : s.substr(a, b - a + 1);
}

static string utf8(unsigned cp) {
    string r;
    if (cp < 0x80) r += char(cp);
    else if (cp < 0x800) { r += char(0xC0 | cp >> 6); r += char(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { r += char(0xE0 | cp >> 12); r += char(0x80 | (cp >> 6 & 0x3F)); r += char(0x80 | (cp & 0x3F)); }
    else { r += char(0xF0 | cp >> 18); r += char(0x80 | (cp >> 12 & 0x3F)); r += char(0x80 | (cp >> 6 & 0x3F)); r += char(0x80 | (cp & 0x3F)); }
    return r;
}

static string decodeEntities(const string& s) {
    string r;
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] != '&') { r += s[i]; continue; }
        size_t semi = s.find(';', i);
        if (semi == string::npos || semi - i > 10) { r += s[i]; continue; }
        string e = s.substr(i + 1, semi - i - 1);
        string rep;
        if (e == "amp") rep = "&"; else if (e == "lt") rep = "<"; else if (e == "gt") rep = ">";
        else if (e == "quot") rep = "\""; else if (e == "apos") rep = "'"; else if (e == "nbsp") rep = " ";
        else if (e.size() > 1 && e[0] == '#') {
            try {
                unsigned cp = (e[1] == 'x' || e[1] == 'X') ? stoul(e.substr(2), nullptr, 16) : stoul(e.substr(1));
                rep = utf8(cp);
            } catch (...) {}
        }
        if (rep.empty()) { r += s[i]; continue; }
        r += rep;
        i = semi;
    }
    return r;
}

static string stripHtml(const string& s) {
    string r;
    bool tag = false;
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '<') {
            tag = true;
            if (s.compare(i, 3, "<br") == 0 || s.compare(i, 2, "<p") == 0) r += '\n';
        } else if (s[i] == '>') tag = false;
        else if (!tag) r += s[i];
    }
    return trim(decodeEntities(r));
}

static string between(const string& s, const string& a, const string& b, size_t from = 0) {
    size_t i = s.find(a, from);
    if (i == string::npos) return "";
    i += a.size();
    size_t j = s.find(b, i);
    return j == string::npos ? "" : s.substr(i, j - i);
}

static string cdata(string s) {
    s = trim(s);
    if (s.rfind("<![CDATA[", 0) == 0 && s.size() >= 12) s = s.substr(9, s.size() - 12);
    return s;
}

static string lower(string s) {
    // ASCII + кириллица в UTF-8 (А-Я, Ё)
    string r;
    for (size_t i = 0; i < s.size(); ++i) {
        unsigned char c = s[i];
        if (c < 0x80) { r += char(tolower(c)); continue; }
        if (c == 0xD0 && i + 1 < s.size()) {
            unsigned char d = s[i + 1];
            if (d >= 0x90 && d <= 0x9F) { r += char(0xD0); r += char(d + 0x20); ++i; continue; }
            if (d >= 0xA0 && d <= 0xAF) { r += char(0xD1); r += char(d - 0x20); ++i; continue; }
            if (d == 0x81) { r += char(0xD1); r += char(0x91); ++i; continue; }
        }
        r += char(c);
    }
    return r;
}

// Обрезка без разрыва многобайтного UTF-8 символа.
static string cut(const string& s, size_t n) {
    if (s.size() <= n) return s;
    while (n > 0 && (static_cast<unsigned char>(s[n]) & 0xC0) == 0x80) --n;
    return s.substr(0, n) + "…";
}

static string htmlEsc(const string& s) {
    string r;
    for (char c : s) {
        if (c == '<') r += "&lt;"; else if (c == '>') r += "&gt;"; else if (c == '&') r += "&amp;";
        else if (c == '"') r += "&quot;"; else r += c;
    }
    return r;
}

// ---------- извлечение контактов ----------

static void addContact(vector<Contact>& v, const string& kind, const string& value, const string& url) {
    for (auto& c : v) if (lower(c.url) == lower(url)) return;
    v.push_back({kind, value, url});
}

// Технические ссылки, которые не являются контактом заказчика.
static bool ignoredTg(const string& name, const string& channel) {
    static const set<string> skip = {"s", "share", "joinchat", "addstickers", "proxy", "iv", "c", "boost"};
    return skip.count(lower(name)) || (!channel.empty() && lower(name) == lower(channel));
}

static vector<Contact> extractContacts(const string& text, const string& rawHtml, const string& channel) {
    vector<Contact> v;
    string all = text + "\n" + rawHtml;
    smatch m;

    static const regex tgLink(R"((?:https?://)?(?:t\.me|telegram\.me)/([A-Za-z0-9_]{4,32})(?![A-Za-z0-9_/]))");
    for (auto it = sregex_iterator(all.begin(), all.end(), tgLink); it != sregex_iterator(); ++it) {
        string u = (*it)[1];
        if (!ignoredTg(u, channel)) addContact(v, "Telegram", "@" + u, "https://t.me/" + u);
    }
    static const regex tgAt(R"((?:^|[^A-Za-z0-9_.@/])@([A-Za-z][A-Za-z0-9_]{3,31}))");
    for (auto it = sregex_iterator(text.begin(), text.end(), tgAt); it != sregex_iterator(); ++it) {
        string u = (*it)[1];
        if (!ignoredTg(u, channel)) addContact(v, "Telegram", "@" + u, "https://t.me/" + u);
    }
    static const regex email(R"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})");
    for (auto it = sregex_iterator(text.begin(), text.end(), email); it != sregex_iterator(); ++it)
        addContact(v, "Email", it->str(), "mailto:" + it->str());

    static const regex phone(R"((?:\+7|\b8|\+375|\+380)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b)");
    for (auto it = sregex_iterator(text.begin(), text.end(), phone); it != sregex_iterator(); ++it) {
        string digits;
        for (char c : it->str()) if (isdigit((unsigned char)c)) digits += c;
        if (digits.size() == 11 && digits[0] == '8') digits[0] = '7';
        addContact(v, "Телефон", it->str(), "tel:+" + digits);
        addContact(v, "WhatsApp", "+" + digits, "https://wa.me/" + digits);
    }
    static const regex wa(R"((?:https?://)?wa\.me/(\d{10,15}))");
    for (auto it = sregex_iterator(all.begin(), all.end(), wa); it != sregex_iterator(); ++it)
        addContact(v, "WhatsApp", "+" + string((*it)[1]), "https://wa.me/" + string((*it)[1]));

    static const regex vk(R"((?:https?://)?(?:m\.)?vk\.(?:com|ru)/([A-Za-z0-9_.]{3,40}))");
    for (auto it = sregex_iterator(all.begin(), all.end(), vk); it != sregex_iterator(); ++it)
        addContact(v, "VK", "vk.com/" + string((*it)[1]), "https://vk.com/" + string((*it)[1]));
    return v;
}

// ---------- парсеры источников ----------

static vector<Order> parseRss(const string& url, const string& xml) {
    vector<Order> res;
    string host = between(url + "/", "://", "/");
    size_t pos = 0;
    while (true) {
        size_t a = xml.find("<item", pos);
        bool atom = false;
        if (a == string::npos) { a = xml.find("<entry", pos); atom = true; }
        if (a == string::npos) break;
        size_t b = xml.find(atom ? "</entry>" : "</item>", a);
        if (b == string::npos) break;
        string it = xml.substr(a, b - a);
        pos = b;

        Order o;
        o.source = host;
        o.title = stripHtml(decodeEntities(cdata(between(it, "<title>", "</title>"))));
        string desc = cdata(between(it, "<description>", "</description>"));
        if (desc.empty()) desc = cdata(between(it, "<content", "</content>").substr(0));
        if (desc.empty()) desc = cdata(between(it, "<summary>", "</summary>"));
        string descHtml = decodeEntities(desc);
        o.text = stripHtml(descHtml);
        o.link = trim(cdata(between(it, "<link>", "</link>")));
        if (o.link.empty()) o.link = between(it, "href=\"", "\"");
        o.date = trim(between(it, "<pubDate>", "</pubDate>"));
        if (o.date.empty()) o.date = trim(between(it, "<updated>", "</updated>"));
        o.id = o.link.empty() ? o.title : o.link;
        o.contacts = extractContacts(o.title + "\n" + o.text, descHtml, "");
        res.push_back(o);
    }
    return res;
}

static vector<Order> parseTelegram(const string& channel, const string& html) {
    vector<Order> res;
    const string marker = "data-post=\"";
    size_t pos = 0;
    while ((pos = html.find(marker, pos)) != string::npos) {
        size_t next = html.find(marker, pos + marker.size());
        string block = html.substr(pos, (next == string::npos ? html.size() : next) - pos);
        string post = between(block, marker, "\"");
        pos += marker.size();

        size_t t = block.find("tgme_widget_message_text");
        if (t == string::npos) continue;
        size_t s = block.find('>', t) + 1;
        // текст сообщения заканчивается перед блоком футера
        size_t e = block.find("tgme_widget_message_footer", s);
        if (e == string::npos) e = block.size();
        string raw = block.substr(s, e - s);

        Order o;
        o.source = "t.me/" + channel;
        o.text = stripHtml(raw);
        o.title = o.text.substr(0, o.text.find('\n'));
        o.title = cut(o.title, 140);
        o.link = "https://t.me/" + post;
        o.date = between(block, "datetime=\"", "\"");
        o.id = o.link;
        o.contacts = extractContacts(o.text, raw, channel);
        res.push_back(o);
    }
    reverse(res.begin(), res.end()); // свежие сверху
    return res;
}

// ---------- хранилище и вывод ----------

static set<string> loadSeen(const string& f) {
    set<string> s;
    ifstream in(f);
    for (string l; getline(in, l);) if (!trim(l).empty()) s.insert(trim(l));
    return s;
}

static void saveSeen(const string& f, const set<string>& s) {
    ofstream out(f);
    for (auto& x : s) out << x << "\n";
}

static vector<Source> loadSources(const string& f) {
    vector<Source> v;
    ifstream in(f);
    if (!in) {
        // первый запуск — создаём файл с источниками по умолчанию
        ofstream out(f);
        out << "# rss <url>  — RSS/Atom лента биржи\n"
               "# tg  <канал> — публичный Telegram-канал с заказами\n"
               "rss https://www.fl.ru/rss/all.xml\n"
               "tg webfrl\n"
               "tg freelancetaverna\n"
               "tg workasap\n"
               "tg theyseeku\n"
               "tg digital_rabota\n";
        out.close();
        in.open(f);
    }
    for (string l; getline(in, l);) {
        l = trim(l);
        if (l.empty() || l[0] == '#') continue;
        istringstream ss(l);
        Source s;
        ss >> s.type >> s.target;
        if (!s.target.empty() && s.target[0] == '@') s.target = s.target.substr(1);
        if (s.type == "rss" || s.type == "tg") v.push_back(s);
        else cerr << "Неизвестный тип источника: " << l << "\n";
    }
    return v;
}

static void writeHtml(const string& f, const vector<Order>& orders) {
    ofstream out(f);
    time_t now = time(nullptr);
    char ts[64];
    strftime(ts, sizeof ts, "%d.%m.%Y %H:%M", localtime(&now));
    out << "<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content='width=device-width'>"
           "<title>Заказы (" << orders.size() << ")</title><style>"
           "body{font-family:system-ui,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#1d1f23}"
           "h1{margin:0 0 4px}.meta{color:#777;margin-bottom:20px}"
           ".o{background:#fff;border-radius:12px;padding:16px 20px;margin-bottom:14px;box-shadow:0 1px 3px #0001}"
           ".src{font-size:12px;color:#888}.t{font-weight:600;font-size:17px;margin:6px 0}"
           ".x{white-space:pre-wrap;color:#333;max-height:9em;overflow:auto;font-size:14px}"
           ".c{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}"
           ".c a{text-decoration:none;padding:7px 12px;border-radius:8px;font-size:14px;color:#fff;background:#2481cc}"
           ".c a.Email{background:#555}.c a.WhatsApp{background:#25a244}.c a.VK{background:#4a76a8}"
           ".c a.Телефон{background:#e67e22}.c a.open{background:#eee;color:#333}"
           ".no{color:#b55;font-size:13px}</style></head><body>"
           "<h1>Заказы</h1><div class=meta>Обновлено " << ts << " · найдено " << orders.size() << "</div>";
    for (auto& o : orders) {
        out << "<div class=o><div class=src>" << htmlEsc(o.source) << " · " << htmlEsc(o.date) << "</div>"
            << "<div class=t>" << htmlEsc(o.title) << "</div><div class=x>" << htmlEsc(o.text) << "</div><div class=c>";
        for (auto& c : o.contacts)
            out << "<a class='" << c.kind << "' href='" << htmlEsc(c.url) << "' target=_blank>Написать: "
                << htmlEsc(c.kind) << " " << htmlEsc(c.value) << "</a>";
        out << "<a class=open href='" << htmlEsc(o.link) << "' target=_blank>Открыть заказ</a></div>";
        if (o.contacts.empty()) out << "<div class=no>Контакт в тексте не указан — откликнитесь на странице заказа</div>";
        out << "</div>";
    }
    out << "</body></html>";
}

static void writeCsv(const string& f, const vector<Order>& orders) {
    ofstream out(f);
    out << "\xEF\xBB\xBF" << "source;date;title;link;contacts\n"; // BOM — чтобы Excel понял UTF-8
    auto q = [](string s) { replace(s.begin(), s.end(), '\n', ' '); string r = "\"";
        for (char c : s) { if (c == '"') r += '"'; r += c; } return r + "\""; };
    for (auto& o : orders) {
        string cs;
        for (auto& c : o.contacts) cs += (cs.empty() ? "" : ", ") + c.kind + " " + c.value;
        out << q(o.source) << ';' << q(o.date) << ';' << q(o.title) << ';' << q(o.link) << ';' << q(cs) << "\n";
    }
}

// ---------- main ----------

int main(int argc, char** argv) {
#ifdef _WIN32
    system("chcp 65001 > nul");
#endif
    string sourcesFile = "sources.txt", seenFile = "seen.txt";
    vector<string> keywords;
    int watchMin = 0;
    bool showAll = false, onlyWithContacts = false;

    for (int i = 1; i < argc; ++i) {
        string a = argv[i];
        if ((a == "-k" || a == "--keyword") && i + 1 < argc) keywords.push_back(lower(argv[++i]));
        else if (a == "--watch" && i + 1 < argc) watchMin = max(1, atoi(argv[++i]));
        else if (a == "--sources" && i + 1 < argc) sourcesFile = argv[++i];
        else if (a == "--all") showAll = true;
        else if (a == "--with-contacts") onlyWithContacts = true;
        else {
            cout << "Использование: order_hunter [-k слово]... [--watch минуты] [--all] [--with-contacts] [--sources файл]\n";
            return a == "-h" || a == "--help" ? 0 : 1;
        }
    }

    vector<Order> board; // всё найденное за сессию — для orders.html
    do {
        auto sources = loadSources(sourcesFile);
        set<string> seen = loadSeen(seenFile);
        int fresh = 0;

        for (auto& s : sources) {
            string url = s.type == "tg" ? "https://t.me/s/" + s.target : s.target;
            string body = fetch(url);
            if (body.empty()) { cerr << "[!] Не удалось загрузить " << url << "\n"; continue; }
            auto orders = s.type == "tg" ? parseTelegram(s.target, body) : parseRss(url, body);

            for (auto& o : orders) {
                if (!showAll && seen.count(o.id)) continue;
                seen.insert(o.id);
                if (!keywords.empty()) {
                    string hay = lower(o.title + " " + o.text);
                    if (none_of(keywords.begin(), keywords.end(), [&](const string& k) { return hay.find(k) != string::npos; }))
                        continue;
                }
                if (onlyWithContacts && o.contacts.empty()) continue;
                ++fresh;
                board.insert(board.begin(), o);

                cout << "\n==== [" << o.source << "] " << o.date << "\n" << o.title << "\n";
                string preview = cut(o.text, 300);
                replace(preview.begin(), preview.end(), '\n', ' ');
                if (!preview.empty() && preview != o.title) cout << preview << "\n";
                cout << "Заказ: " << o.link << "\n";
                if (o.contacts.empty()) cout << "Контакты: нет в тексте — отклик через страницу заказа\n";
                for (auto& c : o.contacts) cout << "Написать (" << c.kind << "): " << c.url << "\n";
            }
        }
        saveSeen(seenFile, seen);
        writeHtml("orders.html", board);
        writeCsv("orders.csv", board);
        cout << "\nНовых заказов: " << fresh << ". Открой orders.html — там кнопки «Написать».\n";

        if (watchMin) {
            if (fresh) cout << '\a';  // звуковой сигнал о новых заказах
            cout << "Следующая проверка через " << watchMin << " мин...\n" << flush;
            this_thread::sleep_for(chrono::minutes(watchMin));
        }
    } while (watchMin);
    return 0;
}
