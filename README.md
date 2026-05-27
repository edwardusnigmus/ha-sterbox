# Sterbox HA API Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/edwardusnigmus/ha-sterbox.svg)](https://github.com/edwardusnigmus/ha-sterbox/releases)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1.0+-blue.svg)](https://www.home-assistant.io)

Natywna integracja sterownika PLC **Sterbox** dla Home Assistant.

## Funkcje

- Odczyt zmiennych analogowych (`@gca` → `sensor`) i cyfrowych (`@gcd` → `binary_sensor`)
- Zapis cyfrowy (`@scd` → `switch`, `switch_fb`, `button`) i analogowy (`@sca` → `number`)
- Rolety (`cover`) z pełną obsługą stanów: krańcówki + feedback ruchu (animacja otwierania/zamykania)
- Switch z feedbackiem — stan zawsze aktualny z PLC, reaguje na fizyczne włączniki
- Panel boczny do zarządzania zmiennymi bez edycji YAML
- Priorytety odpytywania (wysoki/średni/niski) z osobnymi interwałami
- Grupowanie zmiennych w panelu
- Import/Export konfiguracji JSON
- Proaktywne odświeżanie sesji HTTP (zapobiega wygasaniu sesji)
- Tolerancja błędów — encje nie stają się niedostępne przy krótkich przerwach
- Hasło opcjonalne — Sterboxy bez autoryzacji działają od razu
- Obsługa wielu instancji Sterboxa

## Instalacja przez HACS

1. HACS → **Custom repositories** → dodaj `https://github.com/edwardusnigmus/ha-sterbox` → kategoria **Integration**
2. Zainstaluj **Sterbox HA API Integration**
3. Restart Home Assistant
4. **Ustawienia → Integracje → Dodaj integrację → Sterbox**

## Instalacja ręczna

Skopiuj katalog `custom_components/sterbox/` do `/config/custom_components/` i zrestartuj HA.

## Konfiguracja

Po dodaniu integracji panel boczny **Sterbox** pojawia się automatycznie w menu HA.

### Typy zmiennych

| Obwód | Typ encji | Opis |
|-------|-----------|------|
| `@gca` | `sensor` | Odczyt analogowy — temperatura, napięcie, itp. |
| `@gcd` | `binary_sensor` | Odczyt cyfrowy — czujnik ON/OFF |
| `@scd` | `switch` | Zapis cyfrowy — włącz/wyłącz |
| `@scd` | `switch_fb` | Zapis cyfrowy + potwierdzenie stanu z `@gcd` |
| `@scd` | `button` | Jednorazowy impuls (0/1/2=toggle) |
| `@sca` | `number` | Zapis analogowy — suwak lub pole tekstowe |
| — | `cover` | Roleta — pełna obsługa stanów |

### Konfiguracja rolety

Roleta obsługuje cztery opcjonalne sygnały zwrotne z PLC:

| Pole | Obwód | Efekt w HA |
|------|-------|------------|
| Krańcówka góra | `@gcd` | Ikona 🔓 gdy roleta na górze |
| Krańcówka dół | `@gcd` | Ikona 🔒 gdy roleta na dole |
| Feedback otwierania | `@gcd` | Animacja ⬆ Otwieranie... podczas ruchu |
| Feedback zamykania | `@gcd` | Animacja ⬇ Zamykanie... podczas ruchu |

Bez feedbacku — stan lokalny (kliknięcie przycisku). Z feedbackiem — stan w czasie rzeczywistym z PLC.

### Priorytety odpytywania

Każda zmienna ma przypisany priorytet:
- 🔴 **Wysoki** — co `interval_high` sekund (domyślnie 1s)
- 🟡 **Średni** — co `interval_medium` sekund (domyślnie 5s)
- 🔵 **Niski** — co `interval_low` sekund (domyślnie 10s)

## Wymagania

- Home Assistant 2024.1.0+
- Sterbox z dostępem HTTP w sieci lokalnej

## Autor

**ENIGMA** · [GitHub](https://github.com/edwardusnigmus/ha-sterbox)
