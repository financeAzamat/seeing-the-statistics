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
     tick labels. Namespaced keys: a bare 'k'/'m' key collided with page text —
     corr abbreviates minutes as "m", and a shared 'm' made its eruption-length
     axis read "2,0 млн". A leading space is part of the value because the
     formatter concatenates directly: '17' + ' тыс.' reads correctly. */
  '__mag_k': ' тыс.',
  '__mag_m': ' млн',

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

  /* ================================================================
     MODULE 4 — correlation and the range you looked at (corr.render.js)
     ================================================================ */

  /* ---- panel 1: the scatter */
  ['r = {0} on all {1} stones in this window   ·   {2} of {3} drawn here fall '
   + 'inside']:
    'r = {0} по всем {1} камням в этом окне   ·   {2} из {3} нанесённых здесь '
    + 'попадают внутрь',
  'SIZE AGAINST PRICE · {0}': 'РАЗМЕР ПРОТИВ ЦЕНЫ · {0}',

  /* ---- panel 2: r window by window */
  'WHAT r SAYS, WINDOW BY WINDOW': 'ЧТО ГОВОРИТ r, ОКНО ЗА ОКНОМ',
  'same stones, same prices — only the range of sizes differs':
    'те же камни, те же цены — различается только диапазон размеров',
  'r = {0} at full range': 'r = {0} на всём диапазоне',

  /* ---- panel 3: the geyser.
     'm' abbreviates MINUTES on the eruption-length axis. It is a page string,
     which is why draw.js's magnitude suffixes had to be namespaced away from
     it — with a shared key this axis rendered "2,0 млн". */
  'THE SAME TRAP IN REVERSE · OLD FAITHFUL':
    'ТА ЖЕ ЛОВУШКА НАОБОРОТ · OLD FAITHFUL',
  ['r = {0} on {1} eruptions   ·   high across the two clusters, low inside '
   + 'either one']:
    'r = {0} по {1} извержениям   ·   высокий поперёк двух групп, низкий '
    + 'внутри каждой',
  'm': ' мин',
  'SHORT  r = {0}': 'КОРОТКИЕ  r = {0}',
  'LONG  r = {0}': 'ДЛИННЫЕ  r = {0}',

  /* ---- provenance and screen-reader text */
  'Geyser: {0}': 'Гейзер: {0}',
  ['Diamonds, {0}: correlation {1} on {2} stones, against {3} across all '
   + 'sizes. Geyser: {4} overall, {5} within short eruptions and {6} within '
   + 'long ones.']:
    'Бриллианты, {0}: корреляция {1} по {2} камням против {3} по всем размерам. '
    + 'Гейзер: {4} в целом, {5} внутри коротких извержений и {6} внутри длинных.',

  /* ---- data-file prose from corr.js */
  'Size (carat)': 'Размер (караты)',
  'Price ($)': 'Цена ($)',
  'Eruption length (min)': 'Длительность извержения (мин)',
  'Wait until next (min)': 'Ожидание следующего (мин)',

  'Diamonds (ggplot2 / seaborn reference dataset)':
    'Бриллианты (эталонный набор ggplot2 / seaborn)',
  ['Every stone in the standard diamonds reference table: its weight in carats '
   + 'against its price in US dollars.']:
    'Каждый камень из стандартной эталонной таблицы бриллиантов: вес в каратах '
    + 'против цены в долларах США.',
  'every r computed on the FULL population inside its window':
    'каждый r посчитан по ПОЛНОЙ совокупности внутри своего окна',
  '1200 stones drawn at random (MINSTD seed 20260913) for the plot only':
    '1 200 камней отобраны случайно (MINSTD seed 20260913) только для графика',

  'Old Faithful eruptions (Azzalini & Bowman, 1990)':
    'Извержения гейзера Old Faithful (Azzalini & Bowman, 1990)',
  ['272 consecutive Old Faithful eruptions: how long each one lasted against '
   + 'how long you then waited for the next.']:
    '272 последовательных извержения гейзера Old Faithful: сколько длилось '
    + 'каждое против того, сколько потом пришлось ждать следующего.',
  'all 272 eruptions, no exclusions': 'все 272 извержения, без исключений',
  'split at an eruption length of 3 minutes':
    'разделение по длительности извержения в 3 минуты',
  'every point plotted — no sampling': 'нанесены все точки — без выборки',

  /* ---- the carat windows. Comma decimals, and "кар" for carats. */
  'full range': 'весь диапазон',
  '0.30–1.50 ct': '0,30–1,50 кар',
  '0.50–1.20 ct': '0,50–1,20 кар',
  '0.90–1.10 ct': '0,90–1,10 кар',
  '0.95–1.05 ct': '0,95–1,05 кар',
  '0.99–1.01 ct': '0,99–1,01 кар',

  /* ================================================================
     MODULE 5 — the Central Limit Theorem (clt.render.js)
     ================================================================ */

  /* ---- the caption above the canvas and the population axis */
  'The data — <em>{0}, {1} · {2} real records, one dot each</em>':
    'Данные — <em>{0}, {1} · {2} реальных записей, по точке на каждую</em>',
  'one dot = one record': 'одна точка = одна запись',

  /* ---- readouts. 'min' is the geyser's unit as the data file spells it —
     distinct from corr's ' min' and from the magnitude keys above. */
  'min': 'мин',
  '{0}  ·  pred {1}': '{0}  ·  прогноз {1}',
  '  ✓ yours is enough': '  ✓ у вас достаточно',
  '  ✗ yours is too small': '  ✗ у вас меньше',

  /* ---- provenance */
  'On screen: <b>{0}</b> records, mean <b>{1}</b>, spread <b>{2}</b>.':
    'На экране: <b>{0}</b> записей, среднее <b>{1}</b>, разброс <b>{2}</b>.',
  'This is the complete dataset.': 'Это полный набор данных.',
  ['Drawn from <b>{0}</b> whose mean is <b>{1}</b> and spread <b>{2}</b> — '
   + 'close enough that the sample on screen represents the pool it came from.']:
    'Отобрано из <b>{0}</b>, где среднее <b>{1}</b> и разброс <b>{2}</b>: '
    + 'достаточно близко, чтобы выборка на экране представляла ту совокупность, '
    + 'из которой она взята.',

  /* ---- controls and the screen-reader announcements */
  'Sample size {0}. Predicted standard error {1}.':
    'Размер выборки {0}. Прогнозируемая стандартная ошибка {1}.',
  '{0}: {1} records, mean {2}, spread {3}.':
    '{0}: {1} записей, среднее {2}, разброс {3}.',
  '{0} averages drawn.': 'Набрано средних: {0}.',
  'resume': 'продолжить',
  'pause': 'пауза',
  'Reset.': 'Сброшено.',

  /* ---- data-file prose from datasets.js.
     'Wait between eruptions' is NOT repeated here: typical.js uses the same
     English label, so the Module 3 entry above already covers it. A second copy
     would be silently swallowed by the object literal. */
  'Order value per invoice': 'Сумма заказа по счёту',
  'Price per diamond': 'Цена за бриллиант',

  'Old Faithful (Härdle, W., 1991)': 'Гейзер Old Faithful (Härdle, W., 1991)',
  'diamonds (Wickham, H., ggplot2)': 'Бриллианты (Wickham, H., ggplot2)',

  ['Every completed order placed with a UK online gift retailer between 1 Dec '
   + '2010 and 9 Dec 2011. Line items summed to one total per invoice.']:
    'Каждый завершённый заказ у британского интернет-магазина подарков с '
    + '1 декабря 2010 по 9 декабря 2011 года. Позиции сведены в один итог по счёту.',
  ['Minutes between consecutive eruptions of the Old Faithful geyser, '
   + 'Yellowstone. Short waits and long waits, with very little in between.']:
    'Минуты между последовательными извержениями гейзера Old Faithful, '
    + 'Йеллоустон. Короткие ожидания и длинные, и почти ничего между ними.',
  ['Retail prices of 53,940 diamonds. Most are inexpensive and the dearest '
   + 'costs close to eight times the middle one, which is what gives this data '
   + 'its long tail.']:
    'Розничные цены 53 940 бриллиантов. Большинство недорогие, а самый дорогой '
    + 'стоит почти в восемь раз больше срединного — именно это даёт данным '
    + 'длинный хвост.',

  "9,288 credit notes / cancellations removed (invoice no. begins 'C')":
    'удалено 9 288 кредитных нот и отмен (номер счёта начинается на «C»)',
  ['2,332 non-product lines removed (postage, bank charges, manual '
   + 'adjustments, samples)']:
    'удалено 2 332 непродуктовые строки (доставка, банковские сборы, ручные '
    + 'корректировки, образцы)',
  '2,500 lines with a non-positive quantity or price removed':
    'удалено 2 500 строк с неположительным количеством или ценой',
  'aggregated to 19,773 invoices': 'сведено к 19 773 счетам',
  ['190 wholesale invoices above 4,450 excluded so the axis is readable (the '
   + '99th percentile is 4,409); 19,583 invoices remain']:
    'исключено 190 оптовых счетов выше 4 450, чтобы ось оставалась читаемой '
    + '(99-й процентиль равен 4 409); осталось 19 583 счёта',
  'all 272 observations used — nothing excluded':
    'использованы все 272 наблюдения — ничего не исключено',
  'all 53,940 priced records used — nothing excluded':
    'использованы все 53 940 записей с ценой — ничего не исключено',
  '700 drawn at random (seed 20260913) as the population on screen':
    '700 отобраны случайно (seed 20260913) как совокупность на экране',

  /* ---- the three dataset hints. These are the longest strings in the table;
     each is the explanatory paragraph under the canvas for one dataset. */
  ['Real invoices from a UK online shop. Most orders are small and a few are '
   + 'huge, so the average order (£458) is much bigger than the typical one '
   + '(£305) — a handful of big spenders drag the average up. This is the hard '
   + 'case: even 30 orders is not enough to make the averages sit evenly. '
   + 'Click 300 to see them finally settle.']:
    'Настоящие счета британского интернет-магазина. Большинство заказов '
    + 'небольшие, а несколько — огромные, поэтому средний заказ (£458) намного '
    + 'больше типичного (£305): горстка крупных покупателей тянет среднее '
    + 'вверх. Это трудный случай: даже 30 заказов не хватает, чтобы средние '
    + 'легли ровно. Нажмите 300, чтобы увидеть, как они наконец устаканиваются.',

  ['Minutes between eruptions of a real geyser. It waits either about 54 '
   + 'minutes or about 80 — almost never in between, which is why the data has '
   + 'two separate humps. Its average of 71 minutes lands in the quiet gap '
   + 'between them: only about one wait in fourteen falls near it, so the '
   + 'average is a number that describes the geyser without describing any of '
   + 'its actual behaviour. Even so, just 5 eruptions per sample is enough to '
   + 'make the averages form one clean bell.']:
    'Минуты между извержениями настоящего гейзера. Он ждёт либо около 54 минут, '
    + 'либо около 80, и почти никогда — между: поэтому у данных два отдельных '
    + 'горба. Их среднее в 71 минуту попадает в тихий промежуток между ними: '
    + 'рядом с ним оказывается лишь примерно одно ожидание из четырнадцати, так '
    + 'что среднее — это число, которое описывает гейзер, не описывая ни одного '
    + 'его настоящего поведения. И всё же всего 5 извержений на выборку хватает, '
    + 'чтобы средние сложились в один аккуратный колокол.',

  ['Prices of 53,940 real diamonds. Most are inexpensive and the dearest costs '
   + 'nearly eight times the middle one, so the tail is long. At 5 and even at '
   + '30 stones per sample the averages still lean right; they only even out '
   + 'around 66, which is why 100 works and 30 does not. This is exactly the '
   + 'case the course\'s "n ≈ 30" rule of thumb is really about.']:
    'Цены 53 940 настоящих бриллиантов. Большинство недорогие, а самый дорогой '
    + 'стоит почти в восемь раз больше срединного, поэтому хвост длинный. При 5 '
    + 'и даже при 30 камнях на выборку средние всё ещё скошены вправо; они '
    + 'выравниваются только около 66 — поэтому 100 работает, а 30 нет. Это '
    + 'ровно тот случай, о котором на самом деле и говорит принятое в курсе '
    + 'правило «n ≈ 30».',

  /* ================================================================
     MODULE 6 — confidence intervals (ci.render.js)
     ================================================================ */

  'The data — <em>{0}, {1} · {2} real records</em>':
    'Данные — <em>{0}, {1} · {2} реальных записей</em>',
  'true average {0}': 'истинное среднее {0}',

  /* ---- readouts. 'z = ' and 't = ' stay untranslated in the code: notation. */
  '{0} pts': '{0} п.п.',
  '{0} to {1}': 'от {0} до {1}',
  'contains the true average — you would have been right':
    'содержит истинное среднее — вы были бы правы',
  ['does NOT contain the true average — you would have reported this in good '
   + 'faith']:
    'НЕ содержит истинное среднее — а вы сообщили бы его добросовестно',

  /* ---- screen-reader announcements on each control */
  '{0}. True average {1}.': '{0}. Истинное среднее {1}.',
  'Sample size {0}. Multiplier {1}.':
    'Размер выборки {0}. Множитель {1}.',
  'Confidence level {0} percent.': 'Уровень доверия {0} процентов.',
  ['Using the true spread and z. This is the textbook ideal you never actually '
   + 'have.']:
    'Используется истинный разброс и z. Это учебный идеал, которого у вас '
    + 'никогда нет.',
  ['Estimating the spread from each sample and using t. This is what you do in '
   + 'practice.']:
    'Разброс оценивается по каждой выборке, и используется t. Именно так делают '
    + 'на практике.',
  '{0} intervals drawn.': 'Построено интервалов: {0}.',

  /* ---- the three dataset hints for this page */
  ['The hard case. Order value is badly lopsided, so a sample that misses the '
   + 'big orders gets both a low average and a small spread — a narrow range in '
   + 'the wrong place. Ask for 95% here with n = 30 and you get about 86%, and '
   + 'almost every miss is on the low side. Raise n to 300 and it recovers to '
   + 'about 94.5%.']:
    'Трудный случай. Сумма заказа сильно перекошена, поэтому выборка, в которую '
    + 'не попали крупные заказы, даёт и низкое среднее, и малый разброс — узкий '
    + 'диапазон в неверном месте. Попросите здесь 95% при n = 30, и вы получите '
    + 'около 86%, причём почти каждый промах окажется в нижнюю сторону. '
    + 'Поднимите n до 300, и показатель восстановится примерно до 94,5%.',
  ['The easy case. This data has two humps but no long tail, so nothing '
   + 'systematically drags the average down. Ask for 95% and you get about '
   + '94.7% even at n = 30 — the textbook promise, kept.']:
    'Простой случай. У этих данных два горба, но нет длинного хвоста, поэтому '
    + 'ничто систематически не тянет среднее вниз. Попросите 95% — и получите '
    + 'около 94,7% даже при n = 30: обещание учебника выполнено.',
  ['In between. A long tail, but not as extreme as the retail orders: 95% '
   + 'asked, about 93% delivered at n = 30. Enough to matter if you are pricing '
   + 'something, not enough to be obvious.']:
    'Промежуточный случай. Длинный хвост есть, но не такой крайний, как у '
    + 'розничных заказов: просят 95%, а при n = 30 выходит около 93%. '
    + 'Достаточно, чтобы иметь значение при ценообразовании, и недостаточно, '
    + 'чтобы броситься в глаза.',

  /* ================================================================
     MODULE 6 — p-values and hypothesis tests (test.render.js)
     ================================================================ */

  'none': 'нет',
  'zero': 'ноль',
  ['The data — <em>{0}, {1} · two samples of {2} drawn from {3} real '
   + 'records</em>']:
    'Данные — <em>{0}, {1} · две выборки по {2} из {3} реальных записей</em>',

  /* ---- canvas labels. 'p = ' and 'α = ' stay in the code untranslated:
     notation, identical in both languages. */
  '  → "significant"': '  → «значимо»',
  '  → not significant': '  → не значимо',
  'level if nothing were going on': 'уровень, если бы ничего не происходило',
  'showing {0} of {1} per group — the test uses all {2}':
    'показано {0} из {1} на группу — тест использует все {2}',

  /* ---- the verdict panel */
  'Nothing changed': 'Ничего не изменилось',
  'B really is {0} higher': 'B действительно выше на {0}',
  'the two groups are identical': 'две группы одинаковы',
  'a real gap of {0}': 'реальный разрыв {0}',
  '{0} of {1} tests': '{0} из {1} тестов',
  'of all tests run': 'из всех проведённых тестов',
  'every one a false alarm': 'каждый из них — ложная тревога',
  'should be α = {0}': 'должно быть α = {0}',
  'missed it {0} of the time': 'пропущено в {0} случаев',
  'this share is the power': 'эта доля и есть мощность',

  /* ---- the single-test readout, graded against the known truth */
  'below α = {0}': 'ниже α = {0}',
  'above α = {0}': 'выше α = {0}',
  'SIGNIFICANT': 'ЗНАЧИМО',
  'not significant': 'не значимо',
  'wrong — a Type I error': 'неверно — ошибка первого рода',
  'correct — nothing to find': 'верно — находить нечего',
  'correct — the effect is real': 'верно — эффект реален',
  'wrong — a Type II error, effect missed':
    'неверно — ошибка второго рода, эффект пропущен',

  /* ---- screen-reader announcements on each control */
  '{0}. Noise divided by average is {1}.':
    '{0}. Шум, поделённый на среднее, равен {1}.',
  ['The two groups are now identical. Every significant result from here is a '
   + 'false alarm.']:
    'Теперь две группы одинаковы. Любой значимый результат отсюда — ложная '
    + 'тревога.',
  ['Group B really is {0} higher. The share of tests that notice is the '
   + 'power.']:
    'Группа B действительно выше на {0}. Доля тестов, которые это замечают, и '
    + 'есть мощность.',
  '{0} per group.': '{0} на группу.',
  'Cut-off {0}. Chance of a fake winner across 20 tests: {1}.':
    'Порог {0}. Шанс ложного победителя на 20 тестах: {1}.',
  '{0} tests run.': 'Проведено тестов: {0}.',

  /* ---- the three dataset hints for this page */
  ['The expensive case. Order value is so noisy relative to its own average '
   + '(1.28) that a real 5% lift needs enormous samples: 9.3% power at 500 per '
   + 'group, still only 23% at 2,000. Set the change to none and the histogram '
   + 'goes flat — that flatness is where the 5% false-alarm rate comes from.']:
    'Дорогой случай. Сумма заказа настолько шумная относительно собственного '
    + 'среднего (1,28), что реальный прирост в 5% требует огромных выборок: '
    + 'мощность 9,3% при 500 на группу и всё ещё лишь 23% при 2 000. Поставьте '
    + 'изменение на «нет» — и гистограмма станет плоской: именно из этой '
    + 'плоскости и берётся частота ложных тревог в 5%.',
  ['The cheap case. Eruption waits are tightly clustered (noise ÷ average = '
   + '0.19), so a 5% shift is easy to see: 43% power at 100 per group and 98% '
   + 'at 500. Same test, same α, forty-five times less data needed — because '
   + 'the metric is quieter.']:
    'Дешёвый случай. Ожидания извержений плотно сгруппированы (шум ÷ среднее = '
    + '0,19), поэтому сдвиг в 5% увидеть легко: мощность 43% при 100 на группу '
    + 'и 98% при 500. Тот же тест, та же α, и данных нужно в сорок пять раз '
    + 'меньше — потому что метрика тише.',
  ['In between, and closer to retail than you would guess: noise ÷ average is '
   + '1.00, so a real 5% lift is caught 12% of the time at 500 per group. '
   + 'Prices look like a well-behaved number and behave like a badly-behaved '
   + 'one.']:
    'Промежуточный случай, и он ближе к розничным заказам, чем можно было бы '
    + 'предположить: шум ÷ среднее равен 1,00, поэтому реальный прирост в 5% '
    + 'улавливается в 12% случаев при 500 на группу. Цены выглядят как '
    + 'приличное число, а ведут себя как неприличное.',

  /* ================================================================
     MODULE 7 — regression and R² (regression.render.js)
     ================================================================ */

  /* ---- 'bn' joins the namespaced magnitude suffixes. Sums of squares on the
     diamonds run to 1e11, so big() shortens them. */
  '__mag_bn': ' млрд',

  '{0} — <em>{1} ({2}) against {3} ({4}) · {5} real records</em>':
    '{0} — <em>{1} ({2}) против {3} ({4}) · {5} реальных записей</em>',

  /* ---- canvas labels */
  'no line at all: always guess the average':
    'вообще без линии: всегда угадывать среднее',
  'drag either handle': 'потяните любую ручку',
  'R² = {0} — worse than no line at all':
    'R² = {0} — хуже, чем вообще без линии',
  'explained {0}%': 'объяснено {0}%',
  'left over {0}%': 'осталось {0}%',
  'average error in each slice — a flat line here means the shape is right':
    'средняя ошибка в каждом срезе — плоская линия здесь означает, что форма верна',

  /* ---- readouts */
  'nothing — this IS the best': 'ничего — это И ЕСТЬ лучшее',
  '{0} per {1}': '{0} на {1}',

  /* ---- provenance and the screen-reader announcements */
  ['On screen: {0} points, R² {1}, slope {2}. Whole source: {3} records, '
   + 'R² {4}, slope {5}.']:
    'На экране: {0} точек, R² {1}, наклон {2}. Весь источник: {3} записей, '
    + 'R² {4}, наклон {5}.',
  '{0}. Best R² {1}, best slope {2}.':
    '{0}. Лучший R² {1}, лучший наклон {2}.',
  'Best fit applied. R² {0}. No line can do better.':
    'Применена лучшая подгонка. R² {0}. Лучше не может никакая линия.',
  'Line reset to flat through the average — the no-model position.':
    'Линия сброшена в плоскую через среднее — положение «без модели».',

  /* ---- data-file prose from pairs.js */
  'Diamond price by size': 'Цена бриллианта от размера',
  'Old Faithful eruptions': 'Извержения гейзера Old Faithful',
  'Invoice value by size of order': 'Сумма счёта от размера заказа',
  'Carat': 'Караты',
  'Price': 'Цена',
  'Eruption length': 'Длительность извержения',
  'Wait until next': 'Ожидание следующего',
  'Items on the order': 'Позиций в заказе',
  'Invoice value': 'Сумма счёта',
  'ct': 'кар',
  'items': 'поз.',

  ['Every diamond in the ggplot2 diamonds dataset: its weight in carats '
   + 'against its retail price.']:
    'Каждый бриллиант из набора diamonds в ggplot2: вес в каратах против '
    + 'розничной цены.',
  'all 53,940 priced records used': 'использованы все 53 940 записей с ценой',
  '800 drawn at random (seed 20260913) as the points on screen':
    '800 отобраны случайно (seed 20260913) — это точки на экране',
  ['Each Old Faithful eruption: how long it lasted, against how long the geyser '
   + 'then waited before the next one.']:
    'Каждое извержение гейзера Old Faithful: сколько оно длилось против того, '
    + 'сколько гейзер потом ждал до следующего.',
  'all 272 eruptions used — nothing excluded':
    'использованы все 272 извержения — ничего не исключено',
  ['Every completed order placed with a UK online gift retailer: how many '
   + 'separate items it contained, against what it came to.']:
    'Каждый завершённый заказ у британского интернет-магазина подарков: сколько '
    + 'в нём было отдельных позиций против того, на какую сумму он вышел.',
  'cancellations, non-product lines and non-positive rows removed':
    'удалены отмены, непродуктовые строки и строки с неположительными значениями',
  ['aggregated to 19,773 invoices, 19,583 at or below 4,450 (the cutoff '
   + 'datasets.js uses)']:
    'сведено к 19 773 счетам, из них 19 583 не выше 4 450 (порог, который '
    + 'использует datasets.js)',

  /* ---- the three dataset notes shown under the canvas */
  ['A high R-squared hiding two separate faults: the residuals bend into a U '
   + 'instead of scattering evenly, and their spread grows many times over from '
   + 'the smallest stones to the largest. The line summarises the middle and is '
   + 'close to useless at the top.']:
    'Высокий R-квадрат, скрывающий два отдельных изъяна: остатки изгибаются в '
    + 'букву U вместо ровного разброса, а их размах вырастает многократно от '
    + 'самых мелких камней к самым крупным. Линия описывает середину и почти '
    + 'бесполезна наверху.',
  ['Almost the same R-squared as the diamonds, and it comes mostly from there '
   + 'being two KINDS of eruption rather than from a trend. Fit the short ones '
   + 'alone and R-squared falls to 0.08; the long ones alone, 0.14.']:
    'Почти тот же R-квадрат, что у бриллиантов, и берётся он в основном из того, '
    + 'что извержений два ВИДА, а не из тренда. Подгоните только короткие — и '
    + 'R-квадрат упадёт до 0,08; только длинные — до 0,14.',
  ['The lowest R-squared of the three and the best-behaved fit of the three. '
   + 'Most of the variation is unexplained, and the slope is still a number you '
   + 'could plan with: each extra item on an order is worth about £7.']:
    'Самый низкий R-квадрат из трёх и самая приличная подгонка из трёх. '
    + 'Большая часть разброса не объяснена, а наклон всё равно остаётся числом, '
    + 'с которым можно планировать: каждая дополнительная позиция в заказе '
    + 'стоит около £7.',
};
