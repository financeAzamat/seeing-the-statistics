/* Russian strings for every translated renderer — one table per locale.
 *
 * Currently covers Simpson's paradox, Module 1 (heuristics and biases),
 * Module 3 (the average is not typical), and the shared axis formatter in
 * draw.js.
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

  /* ================= intuition.render.js — Module 1 ================= */

  /* ---- question panel */
  'QUESTION {0} OF {1}': 'ВОПРОС {0} ИЗ {1}',
  'YOUR CALL': 'ВАШ ХОД',
  'RIGHT': 'ВЕРНО',
  'MISSED': 'МИМО',
  'out by {0}': 'ошибка на {0}',
  'MEASURED  {0}': 'ИЗМЕРЕНО  {0}',

  /* ---- scorecard */
  'YOUR SCORECARD': 'ВАШ РЕЗУЛЬТАТ',
  ['answer all six, then look for a pattern — several misses on the same side '
   + 'is a bias, not bad luck']:
    'ответьте на все шесть и поищите закономерность: несколько промахов в одну '
    + 'сторону — это искажение, а не случайность',
  ['misses on the same side of the truth are systematic, and a systematic error '
   + 'is one you can correct for']:
    'промахи в одну сторону от истины систематичны, а систематическую ошибку '
    + 'можно скорректировать',
  'not answered': 'без ответа',

  /* ---- why panel */
  'WHY': 'ПОЧЕМУ',
  'WHY — ANSWER FIRST': 'ПОЧЕМУ — СНАЧАЛА ОТВЕТЬТЕ',
  ['Commit to an answer above before reading this. An intuition you never '
   + 'stated is an intuition you can always claim you never had.']:
    'Сначала выберите ответ выше. Интуицию, которую вы не озвучили, всегда можно '
    + 'потом объявить не своей.',
  'Worked through in {0}.': 'Подробно разобрано в разделе «{0}».',

  /* ---- module labels, from intuition.js */
  'Module 3 — the average is not typical': 'Раздел 3 — среднее не типично',
  'Module 4 — correlation and your window': 'Раздел 4 — корреляция и ваше окно',
  'Module 5 — the Central Limit Theorem': 'Раздел 5 — центральная предельная теорема',
  'Module 9 — accuracy and confusion': 'Раздел 9 — точность и матрица ошибок',

  /* ---- question 1 */
  'Of 19,773 real online orders, what share came in BELOW the average order value?':
    'Из 19 773 реальных заказов какая доля оказалась НИЖЕ среднего чека?',
  'The average was £519.50.': 'Среднее составило £519,50.',
  'We treat the average as the typical case.':
    'Мы принимаем среднее за типичный случай.',
  ['A long tail of very large orders drags the average up past the crowd. 15,285 '
   + 'of the 19,773 orders are below it. The instinct that an average sits in the '
   + 'middle is only safe when the data is symmetric, and real money data almost '
   + 'never is.']:
    'Длинный хвост очень крупных заказов тянет среднее вверх, мимо основной '
    + 'массы. Ниже него оказались 15 285 заказов из 19 773. Интуиция, что среднее '
    + 'лежит посередине, работает только на симметричных данных, а реальные '
    + 'денежные данные почти никогда такими не бывают.',

  /* ---- question 2 */
  ['The average diamond in the reference table costs $3,933. What does the '
   + 'COMMONEST diamond cost?']:
    'Средний бриллиант в справочной таблице стоит $3 933. Сколько стоит САМЫЙ '
    + 'ЧАСТЫЙ?',
  'Two of these four numbers are real summaries of the same 53,940 stones.':
    'Два из этих четырёх чисел — реальные сводные величины по тем же 53 940 камням.',
  'We assume one summary number can stand in for a whole distribution.':
    'Мы считаем, что одно сводное число может заменить всё распределение.',
  ['The commonest price is about a quarter of the average. $2,401 is the median '
   + 'and $3,933 is the mean — both correct, and neither describes the stone you '
   + 'are most likely to meet.']:
    'Самая частая цена — примерно четверть среднего. $2 401 — это медиана, '
    + '$3 933 — среднее. Оба числа верны, и ни одно не описывает камень, который '
    + 'вы вероятнее всего встретите.',

  /* ---- question 3 */
  ['Across all sizes, diamond size and price correlate at +0.92. Among 3,823 '
   + 'stones that ALL weigh almost exactly one carat, what is the correlation?']:
    'По всем размерам размер и цена бриллианта коррелируют на +0,92. Среди '
    + '3 823 камней, которые ВСЕ весят почти ровно один карат, какая корреляция?',
  'Nothing about the stones changed. Only which of them you can see.':
    'В самих камнях не изменилось ничего. Изменилось только то, какие из них вам '
    + 'видны.',
  ['We read a correlation as a property of the relationship rather than of the '
   + 'sample.']:
    'Мы читаем корреляцию как свойство связи, а она — свойство выборки.',
  ['Correlation compares how much price moves WITH size against how much it '
   + 'moves in total. Hold size almost still and there is nearly nothing left for '
   + 'it to explain, while every other reason prices differ carries on. +0.41 is '
   + 'the real answer for a slightly wider window, which is why it is a tempting '
   + 'guess.']:
    'Корреляция сравнивает, насколько цена движется ВМЕСТЕ с размером, с тем, '
    + 'насколько она движется вообще. Почти зафиксируйте размер — и объяснять ему '
    + 'станет почти нечего, а все прочие причины разброса цен останутся. +0,41 — '
    + 'это настоящий ответ для чуть более широкого окна, поэтому он и '
    + 'соблазнителен.',

  /* ---- question 4 */
  ['Old Faithful: how long an eruption lasts and how long you then wait '
   + 'correlate at +0.90 across all 272 eruptions. Among the 97 SHORT eruptions '
   + 'only, what is it?']:
    'Гейзер Старый Служака: длительность извержения и последующее ожидание '
    + 'коррелируют на +0,90 по всем 272 извержениям. А только среди 97 КОРОТКИХ '
    + 'извержений?',
  'The geyser has two habits: short-then-soon, and long-then-later.':
    'У гейзера две привычки: коротко — и скоро, долго — и потом.',
  ['We credit a pooled correlation to a relationship that only exists between '
   + 'the groups.']:
    'Мы приписываем сводную корреляцию связи, которая существует только между '
    + 'группами.',
  ['Almost all of that +0.90 is the gap BETWEEN the two habits, not agreement '
   + 'inside either one. Knowing which habit you are in tells you a great deal; '
   + 'knowing the exact length, once you know the habit, tells you very little.']:
    'Почти весь этот +0,90 — это разрыв МЕЖДУ двумя привычками, а не согласие '
    + 'внутри каждой. Знание того, в какой вы привычке, говорит очень много. '
    + 'Знание точной длительности, когда привычка уже известна, — очень мало.',

  /* ---- question 5 */
  ['How many real orders must you average together before those averages stop '
   + 'being lopsided and turn roughly symmetric?']:
    'Сколько реальных заказов нужно усреднить, чтобы эти средние перестали быть '
    + 'скошенными и стали примерно симметричными?',
  'The textbook rule of thumb is 30.': 'Учебное правило большого пальца — 30.',
  'We remember a rule of thumb and forget the condition attached to it.':
    'Мы запоминаем правило большого пальца и забываем условие, при котором оно '
    + 'работает.',
  ['"n = 30" is a rule about how skewed the underlying data is, not a constant. '
   + 'Order values are heavily skewed, so their averages need roughly ten times '
   + 'the folk number before they behave.']:
    '«n = 30» — это правило о том, насколько скошены исходные данные, а не '
    + 'постоянная. Суммы заказов сильно скошены, поэтому их средним нужно примерно '
    + 'вдесятеро больше народного числа, чтобы начать вести себя прилично.',

  /* ---- question 6 */
  ['A model that flags NOTHING AT ALL — it always answers "no" — is scored on '
   + 'the real diamond task. What accuracy does it get?']:
    'Модель, которая не помечает ВООБЩЕ НИЧЕГО и всегда отвечает «нет», '
    + 'оценивается на реальной задаче с бриллиантами. Какую точность она получит?',
  'About one stone in ten is a genuine positive.':
    'Примерно один камень из десяти — настоящий положительный случай.',
  ['We accept a single headline score without asking what a useless model would '
   + 'get.']:
    'Мы принимаем одну заголовочную цифру, не спросив, сколько набрала бы '
    + 'бесполезная модель.',
  ['Because only about 9.7% of cases are positive, answering "no" every time is '
   + 'right in the other 90.3%. Accuracy on a lopsided problem rewards doing '
   + 'nothing, which is why it is the wrong score to optimise.']:
    'Поскольку положительных случаев всего около 9,7 %, ответ «нет» каждый раз '
    + 'верен в остальных 90,3 %. На перекошенной задаче accuracy награждает за '
    + 'бездействие — поэтому оптимизировать её неправильно.',

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

  /* ================================================================
     MODULE 3 — the average is not typical (typical.render.js)
     ================================================================ */

  /* ---- shared axis formatter (draw.js fmtNum). Compact magnitude suffixes on
     tick labels. A leading space is part of the value because the formatter
     concatenates directly: '17' + ' тыс.' reads correctly, '17тыс.' does not. */
  'k': ' тыс.',
  'm': ' млн',

  /* ---- panel 1: the distribution.
     Two title variants rather than one with an interpolated noun: Russian
     inflects the noun with the quantifier, so "ВСЕ" + a substituted word
     cannot be made to agree in every case. */
  'EVERY WAIT · {0} · {1} REAL RECORDS':
    'ВСЕ ОЖИДАНИЯ · {0} · {1} РЕАЛЬНЫХ ЗАПИСЕЙ',
  'EVERY ONE · {0} · {1} REAL RECORDS':
    'ВСЕ НАБЛЮДЕНИЯ · {0} · {1} РЕАЛЬНЫХ ЗАПИСЕЙ',
  '{0} of {1} — {2}% — are BELOW the average':
    '{0} из {1} — {2}% — НИЖЕ среднего',
  '   (+{0} beyond {1}, off the right of this chart)':
    '   (+{0} за пределом {1}, правее края графика)',
  'AVERAGE {0}': 'СРЕДНЕЕ {0}',
  'MIDDLE {0}': 'СЕРЕДИНА {0}',

  /* ---- panel 2: one square per percent */
  'THE SAME FACT AS A COUNT OF 100': 'ТО ЖЕ САМОЕ В ПЕРЕСЧЁТЕ НА 100',
  '{0}% BELOW': '{0}% НИЖЕ',
  ['{0} of every 100 records are below the average — one square is one percent '
   + 'of {1}']:
    '{0} из каждых 100 записей ниже среднего — один квадрат равен одному '
    + 'проценту от {1}',

  /* ---- panel 3: how often the average happens */
  'HOW OFTEN THE AVERAGE ACTUALLY HAPPENS':
    'КАК ЧАСТО СРЕДНЕЕ ВСТРЕЧАЕТСЯ НА САМОМ ДЕЛЕ',
  'NO TYPICAL CASE': 'ТИПИЧНОГО СЛУЧАЯ НЕТ',
  'within ±{0} of each value': 'в пределах ±{0} от каждого значения',
  'NEAR THE AVERAGE  {0}': 'РЯДОМ СО СРЕДНИМ  {0}',
  'NEAR THE COMMONEST  {0}': 'РЯДОМ С САМЫМ ЧАСТЫМ  {0}',
  'two clusters at {0} and {1} — the average sits in the gap':
    'две группы: {0} и {1} — среднее попадает в промежуток',

  /* ---- provenance line and the screen-reader description.
     "процента", not "процентов": a decimal quantity in Russian takes the
     genitive SINGULAR, so "77,3 процентов" is ungrammatical. These strings are
     only ever fed a one-decimal figure, so the singular is always right here. */
  'source': 'источник',
  ['{0}: average {1}, middle value {2}. {3} percent of {4} records are below '
   + 'the average.']:
    '{0}: среднее {1}, срединное значение {2}. {3} процента из {4} записей '
    + 'ниже среднего.',
  ['This data has two clusters, at {0} and {1}; the average falls between them '
   + 'and only {2} percent of values are near it.']:
    'В этих данных две группы: {0} и {1}. Среднее попадает между ними, и рядом '
    + 'с ним оказывается только {2} процента значений.',
  ['Only {0} percent of values are near the average, against {1} percent near '
   + 'the commonest value.']:
    'Рядом со средним только {0} процента значений, рядом с самым частым — '
    + '{1} процента.',

  /* ---- data-file prose from typical.js, passed through TR so the generated
     data file needs no rebuild. The dataset citations keep their original
     titles (that is how they are cited) with the descriptive part in Russian. */
  'Order value': 'Сумма заказа',
  'Diamond price': 'Цена бриллианта',
  'Wait between eruptions': 'Ожидание между извержениями',

  /* The unit suffix on the geyser axis. The leading space is part of the value
     because fmt() concatenates it straight onto the number. */
  ' min': ' мин',

  ['Every completed order placed with a UK online gift retailer between 1 Dec '
   + '2010 and 9 Dec 2011, with line items summed to one total per invoice.']:
    'Каждый завершённый заказ у британского интернет-магазина подарков с '
    + '1 декабря 2010 по 9 декабря 2011 года; позиции сведены в один итог по счёту.',
  'UCI Online Retail (Chen, D., 2015)':
    'Онлайн-ритейл UCI (Chen, D., 2015)',
  '541,909 line items in the source file': '541 909 позиций в исходном файле',
  "credit notes and cancellations removed (invoice no. begins 'C')":
    'кредитные ноты и отмены удалены (номер счёта начинается на «C»)',
  'non-product lines removed (postage, samples, bank charges)':
    'непродуктовые строки удалены (доставка, образцы, банковские сборы)',
  'returns and zero-priced rows removed':
    'возвраты и строки с нулевой ценой удалены',
  '19,773 invoices remain': 'осталось 19 773 счёта',

  'Every stone in the standard diamonds reference table, priced in US dollars.':
    'Каждый камень из стандартной эталонной таблицы бриллиантов, цена в '
    + 'долларах США.',
  'Diamonds (ggplot2 / seaborn reference dataset, 53,940 stones)':
    'Бриллианты (эталонный набор ggplot2 / seaborn, 53 940 камней)',
  'all 53,940 stones, no exclusions': 'все 53 940 камней, без исключений',

  ['The wait before each eruption of the Old Faithful geyser, in minutes, over '
   + 'a continuous run of observations.']:
    'Ожидание перед каждым извержением гейзера Old Faithful, в минутах, за '
    + 'непрерывный ряд наблюдений.',
  'Old Faithful eruptions (Azzalini & Bowman, 1990; 272 waits)':
    'Извержения гейзера Old Faithful (Azzalini & Bowman, 1990; 272 ожидания)',
  'all 272 recorded waits, no exclusions':
    'все 272 записанных ожидания, без исключений',

  /* ================================================================
     REPAIRS — text that was built in the renderers rather than in the markup,
     and so stayed English on the Russian pages until check 7 found it.
     ================================================================ */

  /* ---- Module 1 provenance and screen-reader text (intuition.render.js).
     {1} is a FILE NAME and is deliberately not translated. */
  ['<b>Question {0}</b> — the measured answer comes from <code>{1}</code>, '
   + 'which has its own verification script. ']:
    '<b>Вопрос {0}</b> — измеренный ответ берётся из <code>{1}</code>, '
    + 'у которого есть свой скрипт проверки. ',
  'Worked through in {0}': 'Разбирается в {0}',
  'open that page': 'открыть страницу',
  ['This page reports no figure for what other people guess — there is no '
   + 'survey data behind it, only your own answer against the measurement.']:
    'Эта страница не приводит цифр о том, как отвечают другие: опросных данных '
    + 'за ней нет, есть только ваш собственный ответ против измерения.',
  'Question {0} of {1}.': 'Вопрос {0} из {1}.',
  'You answered {0}. The measured answer is {1}.':
    'Вы ответили {0}. Измеренный ответ — {1}.',
  'Correct.': 'Верно.',
  'Not correct.': 'Ответ неверный.',
  'Choices: {0}.': 'Варианты: {0}.',

  /* ---- Simpson provenance and screen-reader text (simpson.render.js) */
  ['Bars are averages over every matching record. The scatter shows {0} drawn '
   + 'at random, so a bar will not equal the eyeballed centre of the dots. '
   + 'Cells with fewer than {1} stones are drawn hollow and excluded from the '
   + 'direction verdict.']:
    'Столбцы — это средние по всем подходящим записям. На диаграмме рассеяния '
    + 'показаны {0} случайно отобранных точек, поэтому столбец не совпадёт с '
    + 'центром облака на глаз. Ячейки, где меньше {1} камней, нарисованы '
    + 'пустыми и исключены из вывода о направлении.',
  '{0}: aggregate {1}, {2} of {3} size bands agree.':
    '{0}: сводный результат {1}, совпадают {2} из {3} диапазонов размера.',
  'Comparing within {0} to {1} carats only.':
    'Сравнение только внутри диапазона от {0} до {1} карат.',
};
