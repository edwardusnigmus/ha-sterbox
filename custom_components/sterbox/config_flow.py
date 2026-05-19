"""Config Flow — tylko dane urządzenia. Zmiennymi zarządza karta Lovelace."""
from __future__ import annotations
import logging
from typing import Any
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from .const import (
    CONF_GROUPS, CONF_HOST, CONF_INTERVAL_HIGH, CONF_INTERVAL_LOW, CONF_INTERVAL_MEDIUM,
    CONF_NAME, CONF_PASSWORD, CONF_REST_DELAY, CONF_VARS,
    DEFAULT_INTERVAL_HIGH, DEFAULT_INTERVAL_LOW, DEFAULT_INTERVAL_MEDIUM,
    DEFAULT_REST_DELAY, DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


def _device_schema(defaults: dict = {}) -> vol.Schema:
    return vol.Schema({
        vol.Required(CONF_NAME, default=defaults.get(CONF_NAME, "Sterbox")): str,
        vol.Required(CONF_HOST, default=defaults.get(CONF_HOST, "")): str,
        vol.Required(CONF_PASSWORD, default=defaults.get(CONF_PASSWORD, "")): str,
        vol.Optional(CONF_INTERVAL_HIGH,
            default=defaults.get(CONF_INTERVAL_HIGH, DEFAULT_INTERVAL_HIGH)
        ): vol.All(int, vol.Range(min=1, max=60)),
        vol.Optional(CONF_INTERVAL_MEDIUM,
            default=defaults.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM)
        ): vol.All(int, vol.Range(min=1, max=300)),
        vol.Optional(CONF_INTERVAL_LOW,
            default=defaults.get(CONF_INTERVAL_LOW, DEFAULT_INTERVAL_LOW)
        ): vol.All(int, vol.Range(min=1, max=3600)),
        vol.Optional(CONF_REST_DELAY,
            default=defaults.get(CONF_REST_DELAY, DEFAULT_REST_DELAY)
        ): vol.All(vol.Coerce(float), vol.Range(min=0, max=5)),
    })


class SterboxConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Prosty flow — tylko dane urządzenia. Zmienne dodaje się przez kartę Lovelace."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            return self.async_create_entry(
                title=user_input[CONF_NAME],
                data={
                    CONF_NAME: user_input[CONF_NAME],
                    CONF_HOST: user_input[CONF_HOST],
                    CONF_PASSWORD: user_input[CONF_PASSWORD],
                    CONF_INTERVAL_HIGH:   user_input.get(CONF_INTERVAL_HIGH, DEFAULT_INTERVAL_HIGH),
                    CONF_INTERVAL_MEDIUM: user_input.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM),
                    CONF_INTERVAL_LOW:    user_input.get(CONF_INTERVAL_LOW, DEFAULT_INTERVAL_LOW),
                    CONF_REST_DELAY:      user_input.get(CONF_REST_DELAY, DEFAULT_REST_DELAY),
                    CONF_VARS: [],  # pusta lista — zmienne dodaje karta
                },
            )
        return self.async_show_form(
            step_id="user",
            data_schema=_device_schema(),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: config_entries.ConfigEntry) -> SterboxOptionsFlow:
        return SterboxOptionsFlow(entry)


class SterboxOptionsFlow(config_entries.OptionsFlow):
    """Options Flow — tylko edycja danych urządzenia (IP, hasło, interwały).
    Zmiennymi zarządza panel boczny przez serwis sterbox.update_vars."""

    def __init__(self, entry: config_entries.ConfigEntry) -> None:
        config = {**entry.data, **(entry.options or {})}
        self._name     = config.get(CONF_NAME, "Sterbox")
        self._host     = config.get(CONF_HOST, "")
        self._password = config.get(CONF_PASSWORD, "")
        self._interval_high   = config.get(CONF_INTERVAL_HIGH,   DEFAULT_INTERVAL_HIGH)
        self._interval_medium = config.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM)
        self._interval_low    = config.get(CONF_INTERVAL_LOW,    DEFAULT_INTERVAL_LOW)
        self._rest_delay      = config.get(CONF_REST_DELAY,      DEFAULT_REST_DELAY)
        # Zmienne i grupy zachowujemy bez zmian
        self._vars   = list(config.get(CONF_VARS, []))
        self._groups = list(config.get(CONF_GROUPS, []))

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title=user_input[CONF_NAME],
                data={
                    CONF_NAME:            user_input[CONF_NAME],
                    CONF_HOST:            user_input[CONF_HOST],
                    CONF_PASSWORD:        user_input[CONF_PASSWORD],
                    CONF_INTERVAL_HIGH:   user_input.get(CONF_INTERVAL_HIGH,   DEFAULT_INTERVAL_HIGH),
                    CONF_INTERVAL_MEDIUM: user_input.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM),
                    CONF_INTERVAL_LOW:    user_input.get(CONF_INTERVAL_LOW,    DEFAULT_INTERVAL_LOW),
                    CONF_REST_DELAY:      user_input.get(CONF_REST_DELAY,      DEFAULT_REST_DELAY),
                    CONF_VARS:            self._vars,
                    CONF_GROUPS:          self._groups,
                },
            )
        return self.async_show_form(
            step_id="init",
            data_schema=_device_schema({
                CONF_NAME:            self._name,
                CONF_HOST:            self._host,
                CONF_PASSWORD:        self._password,
                CONF_INTERVAL_HIGH:   self._interval_high,
                CONF_INTERVAL_MEDIUM: self._interval_medium,
                CONF_INTERVAL_LOW:    self._interval_low,
                CONF_REST_DELAY:      self._rest_delay,
            }),
        )
