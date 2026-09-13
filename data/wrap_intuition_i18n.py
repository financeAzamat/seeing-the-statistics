"""Wrap the user-visible strings in intuition.render.js with TR().

Same mechanism as simpson.render.js: the KEY is the English format string, so a
missing translation falls back to correct English rather than a bare identifier.
Positional slots {0}, {1} let a Russian sentence reorder values.

Two things are specific to this page:

  * The quiz TEXT lives in intuition.js (prompt, hint, why, bias, moduleLabel —
    542 words of it), and those reads go through TR too. That avoids generating a
    parallel Russian data file, and keeps one string table per locale.

  * Digit grouping is read from the strings table's __locale, as on the Simpson
    page, so the number line prints 19 773 beside Russian prose rather than
    19,773.
"""
import pathlib
import sys

P = pathlib.Path("/Users/satyval/.kiro/crew/workspace/udj-course/intuition.render.js")

HELPER = """  /* ---- TR: translation lookup with positional slots. The KEY is the English
     format string, so a page with no strings file falls back to correct English
     instead of showing a key. */
  function TR(k) {
    var m = window.UDJ_STRINGS;
    var s = (m && m[k]) || k;
    for (var i = 1; i < arguments.length; i++) {
      s = s.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return s;
  }

"""

PAIRS = [
    # ---- question panel
    ("""    K.panel(b.pad, b.y1, W - b.pad * 2, b.h1,
            'QUESTION ' + (qi + 1) + ' OF ' + Q.length,
            done ? (correct(qi) ? 'RIGHT' : 'MISSED') : 'YOUR CALL',""",
     """    K.panel(b.pad, b.y1, W - b.pad * 2, b.h1,
            TR('QUESTION {0} OF {1}', qi + 1, Q.length),
            done ? (correct(qi) ? TR('RIGHT') : TR('MISSED')) : TR('YOUR CALL'),"""),
    ("    var ly = wrapText(qq.prompt, b.L, top, wrapW, phone ? 12 : 14.5,",
     "    var ly = wrapText(TR(qq.prompt), b.L, top, wrapW, phone ? 12 : 14.5,"),
    ("    ly = wrapText(qq.hint, b.L, ly + 4, wrapW, phone ? 10 : 11.5,",
     "    ly = wrapText(TR(qq.hint), b.L, ly + 4, wrapW, phone ? 10 : 11.5,"),
    ("      K.tracked('out by ' + fmtV(qq, off), (mx + gapEnd) / 2,",
     "      K.tracked(TR('out by {0}', fmtV(qq, off)), (mx + gapEnd) / 2,"),
    ("    var lab = 'MEASURED  ' + fmtV(qq, qq.truth);",
     "    var lab = TR('MEASURED  {0}', fmtV(qq, qq.truth));"),

    # ---- scorecard
    ("K.panel(b.pad, b.y2, W - b.pad * 2, b.h2, 'YOUR SCORECARD',",
     "K.panel(b.pad, b.y2, W - b.pad * 2, b.h2, TR('YOUR SCORECARD'),"),
    ("""            nDone < Q.length
              ? 'answer all six, then look for a pattern — several misses on the '
                + 'same side is a bias, not bad luck'
              : 'misses on the same side of the truth are systematic, and a '
                + 'systematic error is one you can correct for',""",
     """            nDone < Q.length
              ? TR('answer all six, then look for a pattern — several misses on '
                   + 'the same side is a bias, not bad luck')
              : TR('misses on the same side of the truth are systematic, and a '
                   + 'systematic error is one you can correct for'),"""),
    ("        K.tracked('not answered', b.R, y + 3, phone ? 7.5 : 9,",
     "        K.tracked(TR('not answered'), b.R, y + 3, phone ? 7.5 : 9,"),

    # ---- why panel
    ("            done ? 'WHY' : 'WHY — ANSWER FIRST', null, null, null, null);",
     "            done ? TR('WHY') : TR('WHY — ANSWER FIRST'), null, null, null, null);"),
    ("""      wrapText('Commit to an answer above before reading this. An intuition you '
               + 'never stated is an intuition you can always claim you never had.',""",
     """      wrapText(TR('Commit to an answer above before reading this. An intuition '
                  + 'you never stated is an intuition you can always claim you '
                  + 'never had.'),"""),
    ("    var y = wrapText(qq.bias, b.L, top, b.R - b.L, phone ? 11 : 12.5,",
     "    var y = wrapText(TR(qq.bias), b.L, top, b.R - b.L, phone ? 11 : 12.5,"),
    ("    y = wrapText(qq.why, b.L, y + 3, b.R - b.L, phone ? 10.5 : 12,",
     "    y = wrapText(TR(qq.why), b.L, y + 3, b.R - b.L, phone ? 10.5 : 12,"),
    ("    wrapText('Worked through in ' + qq.moduleLabel + '.', b.L, y + 3,",
     "    wrapText(TR('Worked through in {0}.', TR(qq.moduleLabel)), b.L, y + 3,"),
]


def main() -> None:
    s = P.read_text(encoding="utf-8")

    if "function TR(" not in s:
        anchor = "  var reduce = !!(window.matchMedia &&"
        assert anchor in s, "no anchor for the helper"
        s = s.replace(anchor, HELPER.rstrip() + "\n\n" + anchor, 1)
        print("  TR() helper inserted")

    # digit grouping follows the locale, as on the Simpson page
    if "UDJ_LOC" not in s:
        s = s.replace(
            "  function q() { return Q[qi] || Q[0]; }",
            "  /* Digit grouping follows the page's locale, declared by the strings\n"
            "     table. Hard-coding en-GB printed 19,773 beside Russian prose. */\n"
            "  var UDJ_LOC = (window.UDJ_STRINGS && window.UDJ_STRINGS.__locale)\n"
            "                || 'en-GB';\n\n"
            "  function q() { return Q[qi] || Q[0]; }", 1)
        s = s.replace("toLocaleString('en-GB')", "toLocaleString(UDJ_LOC)")
        print("  locale-aware number formatting wired in")

    applied = missed = 0
    for old, new in PAIRS:
        if old in s:
            s = s.replace(old, new, 1)
            applied += 1
        else:
            missed += 1
            print(f"  NOT FOUND: {old.strip().splitlines()[0][:70]}")
    P.write_text(s, encoding="utf-8")
    print(f"  {applied}/{len(PAIRS)} wrapped, {missed} missed")
    if missed:
        sys.exit(1)


if __name__ == "__main__":
    main()
