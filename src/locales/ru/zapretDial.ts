export default { zapretDial: {
  transportVia: 'Транспорт через', defaultTransport: 'Транспорт по умолчанию',
  strategy: 'Стратегия Zapret', noStrategy: 'Нет', selectStrategy: 'Выберите стратегию для этого Direct.',
  scope: 'Протоколы и семейства IP зависят от установленного профиля',
  conflict: 'Для включения Zapret уберите detour, интерфейс, исходный адрес, метку и сетевое пространство имён.',
  unavailable: 'Zapret на этом хосте не готов. Существующую привязку можно выключить.',
  uses: 'Zapret через {direct} · {strategy}.', unsupportedDNS: 'Выберите DoH, DoT, DoQ или DoH3 для этого Direct.',
  requiresQUIC: 'Для порта резолвера нужна стратегия QUIC/UDP.',
  states: { off: 'Выкл.', applied: 'Применено.', pending: 'Ожидает применения.', blocked: 'Активный путь не подтверждён.' },
} }
