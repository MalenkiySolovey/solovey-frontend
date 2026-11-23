export default { zapretDial: {
  transportVia: 'Транспорт через', defaultTransport: 'Транспорт по умолчанию',
  strategy: 'Стратегия Zapret', noStrategy: 'Нет', selectStrategy: 'Выберите стратегию для этого Direct.',
  scope: 'Только IPv4/TCP в установленной системе',
  conflict: 'Для включения Zapret уберите detour, интерфейс, исходный адрес, метку и сетевое пространство имён.',
  unavailable: 'Zapret на этом хосте не готов. Существующую привязку можно выключить.',
  uses: 'Zapret через {direct} · {strategy}.', unsupportedDNS: 'Поддерживаются только DoH по HTTPS/TCP и DoT.',
  states: { off: 'Выкл.', applied: 'Применено.', pending: 'Ожидает применения.', blocked: 'Активный путь не подтверждён.' },
} }
