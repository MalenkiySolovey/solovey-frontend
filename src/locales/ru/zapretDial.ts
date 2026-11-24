export default { zapretDial: {
  transportVia: 'Транспорт через', defaultTransport: 'Транспорт по умолчанию',
  strategy: 'Стратегия Zapret', noStrategy: 'Нет', selectStrategy: 'Выберите стратегию для этого Direct.',
  scope: 'Протоколы и семейства IP зависят от установленного профиля',
  conflict: 'Zapret не поддерживает detour, метку маршрутизации, сетевое пространство имён или пользовательский protect_path для этого Direct.',
  unavailable: 'Zapret на этом хосте не готов. Существующую привязку можно выключить.',
  uses: 'Zapret через {direct} · {strategy}.', unsupportedDNS: 'Выберите TCP, UDP, DoH, DoT, DoQ или DoH3 для этого Direct.',
  requiresTCP: 'Стратегия должна покрывать TCP для порта резолвера и семейства IP.',
  requiresUDPAndTCP: 'Стратегия должна покрывать UDP и TCP для одного порта резолвера и семейства IP. При усечённом ответе запрос повторяется по TCP.',
  requiresQUIC: 'Для порта резолвера нужна стратегия QUIC/UDP.',
  states: { off: 'Привязка Direct выключена.', applied: 'Привязка Direct применена; совпадения DNS-пакетов здесь не отображаются.', pending: 'Привязка Direct ожидает применения.', blocked: 'Активный путь для Direct не подтверждён.' },
} }
