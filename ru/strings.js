/* Russian strings for the Simpson's paradox renderer.
 *
 * Keys are the ENGLISH format strings exactly as they appear in TR(...) calls,
 * so a key missing from this table falls back to correct English rather than
 * showing a bare identifier. `{0}`, `{1}` are positional slots — Russian
 * reorders them freely, which is the reason the lookup takes format strings
 * instead of pre-joined fragments.
 *
 * verify_ru.py extracts every TR key from the renderer and fails if one is
 * absent here, so this file cannot silently fall behind the code.
 *
 * Also holds the data-file prose (`what`, `filters`) and the grading labels,
 * which the renderer passes through TR — that avoids regenerating simpson.js
 * just to add a translation.
 */
window.UDJ_STRINGS = {
  /* Digit grouping for this locale. The renderer reads it instead of
     hard-coding en-GB, so the canvas prints $5 324 beside prose that says
     $5 324 rather than $5,324. */
  __locale: 'ru-RU',

  /* ---- scatter panel */
  /* "цвет по признаку «цвет»" was a tautology when the grading IS colour.
     A neutral label works for all three gradings without needing to inflect. */
  'every stone · size against price · coloured by {0}':
    'каждый камень · размер против цены · признак: {0}',
  'showing all, highlighting {0}–{1} ct':
    'показаны все, выделены {0}–{1} кар',
  'showing all sizes': 'показаны все размеры',
  'WORST → BEST': 'ХУЖЕ → ЛУЧШЕ',

  /* ---- mean price panel */
  'mean price · {0}–{1} ct only': 'средняя цена · только {0}–{1} кар',
  'mean price · all sizes': 'средняя цена · все размеры',
  'AS EXPECTED': 'КАК И ОЖИДАЛОСЬ',
  'REVERSED': 'НАОБОРОТ',
  'better grade costs more': 'лучше признак — дороже',
  'better grade costs LESS': 'лучше признак — ДЕШЕВЛЕ',

  /* ---- mean size panel: the mechanism */
  'mean size · all sizes': 'средний размер · все размеры',
  'THE CONFOUND': 'СКРЫТАЯ ПРИЧИНА',
  'top grades are small stones': 'у лучших признаков камни мелкие',

  /* ---- readouts */
  'grade {0}': 'признак {0}',
  'more expensive': 'дороже',
  'CHEAPER': 'ДЕШЕВЛЕ',
  'as it should be': 'как и должно быть',
  'the average is backwards': 'среднее говорит обратное',
  '{0}–{1} ct': '{0}–{1} кар',
  'all sizes': 'все размеры',
  '{0} of {1}': '{0} из {1}',
  'as expected': 'как и ожидалось',

  /* ---- the hint under the controls.
     NOTE the [ ] around the long keys. An object KEY cannot be a concatenation
     expression in JavaScript — `'a' + 'b': v` is a syntax error — so a key too
     long for one line must be a COMPUTED key. The English pages never load this
     file, so the mistake surfaced only when verify_ru.py parsed it with node. */
  ['Within {0}–{1} ct the better {2} grade costs {3} Across all sizes it does not: '
   + 'the aggregate is {4}.']:
    'В диапазоне {0}–{1} кар лучший признак «{2}» стоит {3} По всем размерам — нет: '
    + 'сводное среднее {4}.',
  'more, as it should.': 'дороже, как и должно быть.',
  'less.': 'дешевле.',
  'reversed': 'перевёрнуто',
  'fine': 'в порядке',
  ['Across all sizes, the best {0} grade averages {1} against {2} for the worst — '
   + 'and it is {3} ct against {4} ct. Pick a size band to hold that still.']:
    'По всем размерам лучший признак «{0}» в среднем стоит {1} против {2} у худшего — '
    + 'и при этом {3} кар против {4} кар. Выберите диапазон размера, чтобы '
    + 'зафиксировать его.',

  /* ---- provenance */
  'Data source': 'Источник данных',
  'Comparing across all sizes.': 'Сравнение по всем размерам.',

  /* ---- grading labels, from simpson.js. The data file uses the British
     'Colour'; an entry for 'Color' matched nothing and was removed. */
  'Cut': 'Огранка',
  'Colour': 'Цвет',
  'Clarity': 'Чистота',

  /* ---- data-file prose, passed through TR so simpson.js needs no rebuild.
     Computed keys again — see the note above. */
  ['53,940 real diamonds, each with its size in carats, its retail price, and three '
   + 'independent quality grades assigned by a grader.']:
    '53 940 настоящих бриллиантов: у каждого размер в каратах, розничная цена и три '
    + 'независимые оценки качества, выставленные оценщиком.',
  'all 53,940 priced records used to compute every average below':
    'все 53 940 записей с ценой использованы для всех средних ниже',
  '900 drawn at random (seed 20260913) as the points on screen':
    '900 отобраны случайно (seed 20260913) — это точки на экране',
};
