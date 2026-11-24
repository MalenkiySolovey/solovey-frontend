export default { zapretDial: {
  transportVia: 'Transport via', defaultTransport: 'Default transport',
  strategy: 'Zapret strategy', noStrategy: 'None', selectStrategy: 'Select a strategy for this Direct.',
  scope: 'Protocols and IP families depend on the installed profile',
  conflict: 'Zapret cannot use a detour, routing mark, network namespace or custom protect_path on this Direct.',
  unavailable: 'Zapret is not ready on this Host. An existing binding can still be turned off.',
  uses: 'Zapret via {direct} · {strategy}.', unsupportedDNS: 'Select TCP, UDP, DoH, DoT, DoQ or DoH3 for this Direct.',
  requiresTCP: 'The strategy must cover TCP for the resolver port and IP family.',
  requiresUDPAndTCP: 'The strategy must cover UDP and TCP on the same resolver port and IP family. Truncated replies are retried over TCP.',
  requiresQUIC: 'Requires a QUIC/UDP strategy for the resolver port.',
  states: { off: 'Direct binding off.', applied: 'Direct binding applied; DNS packet matches are not shown here.', pending: 'Direct binding pending.', blocked: 'No verified live path for this Direct.' },
} }
