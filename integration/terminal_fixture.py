"""Small VT screen for isolated PTY checks (not a general terminal emulator)."""
import codecs
import re
import unicodedata


class Screen:
    def __init__(self, rows=40, columns=120):
        self.rows, self.columns = rows, columns
        self.cells = [[' '] * columns for _ in range(rows)]
        self.x = self.y = 0
        self.saved = (0, 0)
        self.top, self.bottom = 0, rows - 1
        self.pending = ''
        self.decoder = codecs.getincrementaldecoder('utf-8')('replace')

    def linefeed(self):
        if self.y == self.bottom:
            del self.cells[self.top]
            self.cells.insert(self.bottom, [' '] * self.columns)
        else:
            self.y = min(self.rows - 1, self.y + 1)

    def csi(self, raw, code):
        if raw.startswith(('?', '>', '<')):
            if raw == '?1049' and code == 'h':
                self.cells = [[' '] * self.columns for _ in range(self.rows)]
                self.x = self.y = 0
            return
        args = [int(x) if x else 0 for x in raw.split(';')]
        n = args[0] or 1
        if code in ('H', 'f'):
            self.y = min(self.rows - 1, max(0, (args[0] or 1) - 1))
            self.x = min(self.columns - 1, max(0, ((args[1] if len(args) > 1 else 1) or 1) - 1))
        elif code == 'A':
            self.y = max(0, self.y - n)
        elif code == 'B':
            self.y = min(self.rows - 1, self.y + n)
        elif code == 'C':
            self.x = min(self.columns - 1, self.x + n)
        elif code == 'D':
            self.x = max(0, self.x - n)
        elif code == 'G':
            self.x = min(self.columns - 1, n - 1)
        elif code == 'd':
            self.y = min(self.rows - 1, n - 1)
        elif code == 'J':
            if args[0] in (2, 3):
                self.cells = [[' '] * self.columns for _ in range(self.rows)]
            elif args[0] == 0:
                self.cells[self.y][self.x:] = [' '] * (self.columns - self.x)
                for y in range(self.y + 1, self.rows):
                    self.cells[y] = [' '] * self.columns
        elif code == 'K':
            start, end = (0, self.columns) if args[0] == 2 else ((0, self.x + 1) if args[0] == 1 else (self.x, self.columns))
            self.cells[self.y][start:end] = [' '] * (end - start)
        elif code == 'X':
            end = min(self.columns, self.x + n)
            self.cells[self.y][self.x:end] = [' '] * (end - self.x)
        elif code == 'r':
            self.top = max(0, n - 1)
            self.bottom = min(self.rows - 1, (args[1] or self.rows) - 1) if len(args) > 1 else self.rows - 1
            self.x = self.y = 0
        elif code == 'S':
            for _ in range(n):
                del self.cells[self.top]
                self.cells.insert(self.bottom, [' '] * self.columns)
        elif code == 'T':
            for _ in range(n):
                del self.cells[self.bottom]
                self.cells.insert(self.top, [' '] * self.columns)

    def feed(self, data):
        self.pending += self.decoder.decode(data)
        i = 0
        while i < len(self.pending):
            c = self.pending[i]
            if c == '\x1b':
                if i + 1 == len(self.pending):
                    break
                kind = self.pending[i + 1]
                if kind == '[':
                    match = re.match(r'\x1b\[([0-?]*)([ -/]*)([@-~])', self.pending[i:])
                    if not match:
                        break
                    self.csi(match[1], match[3])
                    i += match.end()
                    continue
                if kind == ']':
                    end = re.search(r'\x07|\x1b\\', self.pending[i + 2:])
                    if not end:
                        break
                    i += 2 + end.end()
                    continue
                if kind in '()':
                    if i + 2 >= len(self.pending):
                        break
                    i += 3
                    continue
                if kind == '7':
                    self.saved = self.x, self.y
                elif kind == '8':
                    self.x, self.y = self.saved
                i += 2
                continue
            if c == '\r':
                self.x = 0
            elif c == '\n':
                self.linefeed()
            elif c == '\b':
                self.x = max(0, self.x - 1)
            elif c == '\t':
                self.x = min(self.columns - 1, (self.x // 8 + 1) * 8)
            elif ord(c) >= 32:
                width = 0 if unicodedata.combining(c) or c in ('\ufe0f', '\u200d') else (2 if unicodedata.east_asian_width(c) in 'WF' else 1)
                if self.x >= self.columns:
                    self.x = 0
                    self.linefeed()
                if width:
                    self.cells[self.y][self.x] = c
                    if width == 2 and self.x + 1 < self.columns:
                        self.cells[self.y][self.x + 1] = ''
                    self.x += width
            i += 1
        self.pending = self.pending[i:]

    def text(self):
        return '\n'.join(''.join(line).rstrip() for line in self.cells)

    def contains(self, text):
        return ' '.join(text.split()) in ' '.join(self.text().replace('│', ' ').split())
