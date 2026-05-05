# UI Guidelines — Дневник трейдера (Nansen-style)

Единый визуальный стандарт для фронтенда. При новых экранах и правках UI соблюдать этот документ.

---

## 1. Общий тон и атмосфера

- **Тёмная тема (Dark Mode)** — единственный режим, светлой темы нет и не будет
- Базовый фон `#0B0F1F`, карточки `#1A1F2E`
- **Высокая информационная плотность** — данные на первом месте, декора минимум
- Стиль вдохновлён Nansen / DeFi-дашбордами: трейдер чувствует себя аналитиком из фонда
- Акценты — только на ключевых метриках (PnL, риск, Margin Ratio). Всё второстепенное — в тултип

---

## 2. Цветовая схема

```css
--background:       #0B0F1F;    /* основной фон */
--surface:          #1A1F2E;    /* карточки, модалки */
--surface-elevated: #262C3F;    /* hover, активный элемент */
--border:           #2A3040;    /* границы */
--text-primary:     #FFFFFF;    /* заголовки, цифры */
--text-secondary:   #8E98B3;    /* подписи, второстепенное */
--accent-green:     #00D395;    /* профит, бычий тренд */
--accent-red:       #FF4D6D;    /* убыток, медвежий тренд */
--accent-blue:      #2B7FFF;    /* ссылки, акценты, кнопки */
--warning:          #FFB443;    /* риски, предупреждения */
```

**Прозрачности:**

- Второстепенные элементы: `color: rgba(255,255,255,0.6)`
- Слабые разделители: `border-color: rgba(255,255,255,0.08)`
- Hover на строках/карточках: `background: rgba(255,255,255,0.05)`

---

## 3. Типографика

- **Шрифт:** системный стек — `Inter`, `SF Pro`, `Roboto`. Без кастомных загружаемых шрифтов
- **Жирный** (`font-weight: 700`) — только для цифр и ключевых метрик: `1,245.30 $`
- **Моноширинный** (`font-mono`) — числа в таблицах, тикеры (`SOL`, `ETH`), хэши

---

## 4. Tailwind config

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class', // принудительно тёмная, класс 'dark' на <html>
  theme: {
    extend: {
      colors: {
        nansen: {
          bg:      '#0B0F1F',
          surface: '#1A1F2E',
          elevated:'#262C3F',
          border:  '#2A3040',
          text: {
            primary:   '#FFFFFF',
            secondary: '#8E98B3',
          },
          green:   '#00D395',
          red:     '#FF4D6D',
          blue:    '#2B7FFF',
          warning: '#FFB443',
        },
      },
    },
  },
};
```

> **Обязательно:** `darkMode: 'class'` требует класс `dark` на корневом элементе. В `app/layout.tsx` должно быть `<html lang="ru" className="dark">`. Без этого Tailwind `dark:`-классы не применятся и весь стиль сломается.

**Использование в коде:**

```
bg-nansen-bg        bg-nansen-surface      bg-nansen-elevated
text-nansen-green   text-nansen-red        text-nansen-blue
border-nansen-border  text-nansen-text-secondary
```

---

## 5. Компоненты

### 5.1 Навигация (Sidebar)

- Фиксированный сайдбар слева, ширина `260px`
- Фон `#0B0F1F`, тонкая граница справа `1px solid #2A3040`
- Пункт меню: иконка + текст
- Активный пункт: фон `#262C3F`, левая полоска `#2B7FFF` (`border-l-2`)
- Hover: `rgba(255,255,255,0.05)`

```tsx
// Пример класса активного пункта
"bg-nansen-elevated border-l-2 border-nansen-blue text-white"

// Пример класса неактивного пункта
"text-nansen-text-secondary hover:bg-white/5 hover:text-white"
```

**Адаптив:**

- `768–1279px` — сайдбар сворачивается в иконки (без текста), ширина `64px`
- `<768px` — bottom navigation bar (реализуется в **этапе 2.5** вместе с app shell, не ждём PWA)

> **Важно:** bottom navigation bar — это базовый мобильный UX, не PWA-фича. Без него приложение неудобно на телефоне с первого дня. PWA (этап 7) добавляет установку и офлайн — но навигация нужна уже в 2.5.

### 5.2 Карточки (Cards)

```tsx
// Базовый класс карточки
"bg-nansen-surface rounded-xl border border-nansen-border p-5 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
```

- Скругление: `12px` (`rounded-xl`) или `16px` (`rounded-2xl`) для крупных
- Отступы: `20px` (`p-5`)
- Сетка карточек: `display: grid` с явными колонками, без `auto-fill`

### 5.3 Таблицы (основной компонент)

- **Только горизонтальные разделители** — никаких вертикальных линий
- Высота строки: `min-h-[60px]` — `64px` для читаемости
- Заголовки: `text-xs font-semibold text-nansen-text-secondary uppercase tracking-wide`
- Числа: выровнены вправо (`text-right font-mono`)
- Текст / символы: выровнены влево
- Hover строки: `hover:bg-white/5 transition-colors duration-150`

**Числа PnL:**

```tsx
// Позитивное
<span className="text-nansen-green font-bold">+1,245.30 $</span>

// Негативное
<span className="text-nansen-red font-bold">−312.00 $</span>
```

**Бейджи статуса / риска:**

```tsx
// OPEN
"bg-nansen-blue/10 text-nansen-blue text-xs px-2 py-0.5 rounded-full"

// Risk High
"bg-nansen-red/10 text-nansen-red text-xs px-2 py-0.5 rounded-full"

// Risk OK
"bg-nansen-green/10 text-nansen-green text-xs px-2 py-0.5 rounded-full"

// Warning
"bg-nansen-warning/10 text-nansen-warning text-xs px-2 py-0.5 rounded-full"
```

### 5.4 Метрики и виджеты

```tsx
// Крупная метрика (PnL дня, Equity и т.п.)
<div>
  <p className="text-nansen-text-secondary text-xs uppercase tracking-wide">PnL сегодня</p>
  <p className="text-nansen-green text-3xl font-bold font-mono">+842.50 $</p>
  <p className="text-nansen-text-secondary text-xs">+3.2% от депозита</p>
</div>
```

- Значение: `text-3xl font-bold` (`32px`)
- Подпись: `text-xs text-nansen-text-secondary` (`12px`)
- Дельта рядом или снизу

### 5.5 Графики (Recharts)

- Фон графика: прозрачный (`transparent`)
- Сетка: `stroke="rgba(255,255,255,0.08)"`, только горизонтальные линии
- Оси X и Y: `stroke="rgba(255,255,255,0.1)"`, `tick={{ fill: '#8E98B3', fontSize: 11 }}`
- Линия Equity: `stroke="#2B7FFF"`, `strokeWidth=2`
- Область под линией: `fill="url(#gradientBlue)"`, opacity `0.1–0.15`
- Тултип: `contentStyle={{ background: '#1A1F2E', border: '1px solid #2A3040', borderRadius: 8 }}`

### 5.6 Формы и инпуты

```tsx
// Базовый инпут
"bg-nansen-elevated border border-nansen-border rounded-lg px-3 py-2
 text-white placeholder:text-nansen-text-secondary
 focus:outline-none focus:border-nansen-blue
 transition-colors duration-150"
```

- Лейбл: `text-xs text-nansen-text-secondary mb-1`
- Ошибка валидации: под полем, `text-nansen-red text-xs mt-1`
- Select / Combobox: стиль совпадает с инпутом, иконка стрелки `text-nansen-text-secondary`

### 5.7 Кнопки

```tsx
// Primary
"bg-nansen-blue hover:bg-nansen-blue/80 text-white font-medium
 px-4 py-2 rounded-lg transition-colors duration-150"

// Secondary / Ghost
"border border-nansen-border text-nansen-text-secondary
 hover:bg-white/5 hover:text-white px-4 py-2 rounded-lg transition-colors duration-150"

// Danger
"bg-nansen-red/10 text-nansen-red hover:bg-nansen-red/20
 px-4 py-2 rounded-lg transition-colors duration-150"
```

---

## 6. Состояния и обратная связь

### Загрузка

- **Скелетоны** (skeleton screens) с пульсирующей анимацией — для таблиц и карточек
- Маленький инлайн-спиннер — только внутри кнопок ("Синхронизация", "Сохранить")
- Никаких полноэкранных спиннеров

```tsx
// Скелетон-строка таблицы
"animate-pulse bg-nansen-elevated rounded h-4 w-full"
```

### Ошибки

- **Тост** — правый верхний угол, фон `#FF4D6D`, белый текст, fade-in + slide-down, исчезает через 4–5 сек
- **Ошибка формы** — под полем, `text-nansen-red text-xs`
- **Пустое состояние** — иконка + текст по центру области: "Нет сделок за период", "Подключите BingX для получения цен"

### Успех

- Тост с фоном `#00D395`: "Сделка закрыта", "Синхронизация завершена"

---

## 7. Анимации (минимально)

| Что | Как |
|-----|-----|
| Hover карточки / строки | `transition: background 0.15s ease` |
| Hover кнопки | `transition: background 0.15s ease` |
| Появление тоста | `fade-in` + `slide-down`, `duration-200` |
| Переключение вкладок | Мгновенно, без анимации |
| Раскрытие деталей строки | `transition: height 0.2s ease` |
| Всё остальное | Без анимации |

Framer Motion — не использовать.

---

## 8. Адаптивность

| Ширина | Поведение |
|--------|-----------|
| `1280px+` | Полный desktop layout, sidebar `260px` |
| `768–1279px` | Sidebar сворачивается в иконки `64px`, таблицы горизонтально скроллируемые |
| `<768px` | Bottom navigation bar, карточки вместо таблиц |

Desktop-first в v1. Bottom navigation bar реализуется в **этапе 2.5** (app shell) — не откладывать до PWA.  
PWA (этап 7) добавляет установку на устройство и офлайн-режим поверх уже готового мобильного UI.

---

## 9. UI-библиотеки

| Библиотека | Роль | Статус |
|------------|------|--------|
| **shadcn/ui** | Компоненты (Dialog, Popover, Select, Toast) — копируются в проект, легко переопределить | Использовать |
| **Radix UI** | Примитивы (доступность, поведение) | Через shadcn |
| **Recharts** | Графики (Equity curve, PnL chart, распределение) | Использовать |
| Tremor | Альтернатива Recharts для метрик-виджетов | Не добавлять — два стека графиков ломают единообразие |
| MUI / Ant Design | Тяжёлые, сложно переопределить стиль | Не использовать |
| Framer Motion | Избыточные анимации | Не использовать |

---

## 10. Быстрый справочник классов

```tsx
// Карточка
"bg-nansen-surface rounded-xl border border-nansen-border p-5 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"

// Заголовок таблицы
"text-xs font-semibold text-nansen-text-secondary uppercase tracking-wide"

// Строка таблицы
"min-h-[60px] border-b border-nansen-border hover:bg-white/5 transition-colors duration-150"

// Число профит
"text-nansen-green font-bold font-mono"

// Число убыток
"text-nansen-red font-bold font-mono"

// Вторичный текст
"text-nansen-text-secondary text-xs"

// Инпут
"bg-nansen-elevated border border-nansen-border rounded-lg px-3 py-2 text-white
 placeholder:text-nansen-text-secondary focus:outline-none focus:border-nansen-blue"

// Кнопка primary
"bg-nansen-blue hover:bg-nansen-blue/80 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-150"

// Бейдж
"text-xs px-2 py-0.5 rounded-full"
// + цвет: bg-nansen-green/10 text-nansen-green | bg-nansen-red/10 text-nansen-red | bg-nansen-warning/10 text-nansen-warning
```
