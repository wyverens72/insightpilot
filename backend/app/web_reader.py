"""Read bounded public pages, pin DNS, and honor robots policies."""

import http.client
import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

AGENT = "InsightPilot/1.0"
MAX_PAGE = 750_000


class WebProblem(ValueError):
    pass


def normalize_url(value, keep_query=False):
    value = value.strip()
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    try:
        p = urlsplit(value)
        host = (p.hostname or "").encode("idna").decode().lower()
        if (
            p.scheme not in ("http", "https")
            or p.username
            or p.password
            or not host
            or "." not in host
            or p.port not in (None, 80, 443)
            or len(value) > 2000
        ):
            raise ValueError()
        if host.endswith((".local", ".localhost", ".internal", ".test")):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and (not address.is_global or address.is_multicast):
            raise ValueError()
        query = (
            urlencode(
                [
                    (k, v)
                    for k, v in parse_qsl(p.query)
                    if not k.lower().startswith("utm_")
                    and k.lower()
                    not in ("token", "key", "api_key", "auth", "fbclid", "gclid")
                ]
            )
            if keep_query
            else ""
        )
        return urlunsplit((p.scheme, p.netloc.lower(), p.path or "/", query, ""))
    except (ValueError, UnicodeError) as exc:
        raise WebProblem(
            "Enter a public website URL without credentials or a custom port."
        ) from exc


def public_address(host, port):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(
        (
            not ipaddress.ip_address(a[4][0]).is_global
            or ipaddress.ip_address(a[4][0]).is_multicast
        )
        for a in addresses
    ):
        raise WebProblem("Private and local network addresses are not supported.")
    return addresses[0][4][0]


class PinnedHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.create_connection((self.public_ip, self.port), self.timeout)


class PinnedHTTPS(http.client.HTTPSConnection):
    def connect(self):
        sock = socket.create_connection((self.public_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def fetch(url, search=False):
    for _ in range(4):
        p = urlsplit(normalize_url(url, keep_query=True))
        port = p.port or (443 if p.scheme == "https" else 80)
        address = public_address(p.hostname, port)
        connection = (PinnedHTTPS if p.scheme == "https" else PinnedHTTP)(
            p.hostname, port, timeout=8
        )
        connection.public_ip = address
        try:
            target = (p.path or "/") + ("?" + p.query if p.query else "")
            connection.request(
                "GET",
                target,
                headers={
                    "User-Agent": AGENT,
                    "Accept": "text/html,application/xhtml+xml,text/xml,text/plain",
                    "Accept-Encoding": "identity",
                },
            )
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                url = urljoin(url, response.getheader("Location", ""))
                continue
            if response.status != 200:
                raise WebProblem(f"The page returned HTTP {response.status}.")
            content_type = response.getheader("Content-Type", "").lower()
            if not any(t in content_type for t in ("html", "xml", "text/plain")):
                raise WebProblem("Only public text and HTML pages are supported.")
            body = response.read(MAX_PAGE + 1)
            if len(body) > MAX_PAGE:
                raise WebProblem("The page exceeded the reading limit.")
            return body.decode("utf-8", errors="replace"), normalize_url(
                url, keep_query=True
            )
        except (OSError, http.client.HTTPException) as exc:
            raise WebProblem(
                "The page could not be reached within the reading limit."
            ) from exc
        finally:
            connection.close()
    raise WebProblem("The page redirected too many times.")


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.title_parts = [], []
        self.hidden, self.in_title = 0, False
        self.site_name = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self.hidden += 1
        if tag == "title":
            self.in_title = True
        if tag == "meta" and attrs.get("property") == "og:site_name":
            self.site_name = attrs.get("content", "")[:100]
        if tag in ("p", "div", "h1", "h2", "h3", "li", "br", "article", "section"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            self.hidden = max(0, self.hidden - 1)
        if tag == "title":
            self.in_title = False
        if tag in ("p", "div", "li", "article", "section"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            (self.title_parts if self.in_title else self.parts).append(data)

    @property
    def text(self):
        lines = [
            re.sub(r"\s+", " ", s).strip() for s in " ".join(self.parts).splitlines()
        ]
        return "\n".join(dict.fromkeys(s for s in lines if len(s) > 35))[:18000]

    @property
    def title(self):
        return " ".join(self.title_parts).strip()[:200]


def read_page(url):
    p = urlsplit(normalize_url(url))
    try:
        rules, _ = fetch(urlunsplit((p.scheme, p.netloc, "/robots.txt", "", "")))
        parser = RobotFileParser()
        parser.parse(rules.splitlines())
        if not parser.can_fetch(AGENT, url):
            raise WebProblem("Reading is disallowed by this site's robots.txt.")
    except WebProblem as exc:
        if "HTTP 404" not in str(exc) and "HTTP 410" not in str(exc):
            raise
    html, final_url = fetch(url)
    page = PageText()
    page.feed(html)
    title = page.title.lower()
    if any(
        marker in title
        for marker in (
            "access denied",
            "just a moment",
            "captcha",
            "verify you are human",
            "sign in",
            "log in",
        )
    ):
        raise WebProblem("The page requires verification or sign-in.")
    if len(page.text) < 120:
        raise WebProblem(
            "Too little readable text; the page may require JavaScript or sign-in."
        )
    return {
        "title": page.title,
        "text": page.text,
        "site_name": page.site_name,
        "url": final_url,
    }
