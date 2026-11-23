export default { zapretDial: {
  transportVia: 'Transport via', defaultTransport: 'Default transport',
  strategy: 'Zapret strategy', noStrategy: 'None', selectStrategy: 'Select a strategy for this Direct.',
  scope: 'Installed IPv4/TCP only',
  conflict: 'Clear the detour, interface, source address, routing mark and network namespace overrides before enabling Zapret.',
  unavailable: 'Zapret is not ready on this Host. An existing binding can still be turned off.',
  uses: 'Zapret via {direct} · {strategy}.', unsupportedDNS: 'Select DoH, DoT, DoQ or DoH3 for this Direct.',
  requiresQUIC: 'Requires a QUIC/UDP strategy for the resolver port.',
  states: { off: 'Off.', applied: 'Applied.', pending: 'Pending.', blocked: 'No verified live path.' },
} }
