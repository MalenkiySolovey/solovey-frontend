import { defineComponent } from 'vue'
import Data from '@/store/modules/data'
import DomainResolver from '@/components/fields/DomainResolver.vue'
import { boundDirect, hasZapretComponent, isZapretDNSTransport, isZapretSocketOwner, readZapretSummary, zapretOutboundConflict, type ZapretCatalogSummary } from '@/features/zapretBinding'

export default defineComponent({
  props: ['dial', 'mode', 'context'],
  data() {
    return {
      menu: false,
      zapretCatalog: undefined as ZapretCatalogSummary | undefined,
    }
  },
  computed: {
    outTags(): string[] {
      return [...(Data().outbounds ?? []).map((o:any) => o.tag), ...(Data().endpoints ?? []).map((e:any) => e.tag)]
        .filter(tag => this.context !== 'outbound' || tag !== this.dial.tag)
    },
    dnsTransport(): boolean { return this.context === 'dns' && isZapretDNSTransport(this.dial.type) },
    dnsTransportOptions(): { title: string; value: string }[] {
      const tags = this.dial.detour && !this.outTags.includes(this.dial.detour) ? [...this.outTags, this.dial.detour] : this.outTags
      return [{ title: String(this.$t('zapretDial.defaultTransport')), value: '' }, ...tags.map(value => ({ title: value, value }))]
    },
    dnsDetour: {
      get(): string { return this.dial.detour ?? '' },
      set(value: string) { if (value) this.dial.detour = value; else delete this.dial.detour },
    },
    zapretEditor(): boolean { return this.context === 'outbound' && isZapretSocketOwner(this.dial.type) },
    hasZapret(): boolean { return hasZapretComponent() },
    showZapretBinding(): boolean { return this.zapretEditor && (this.hasZapret || Boolean(this.dial.zapret)) },
    zapretConflict() { return zapretOutboundConflict(this.dial) },
    zapretScope(): string {
      switch (this.dial.type) {
        case 'http': return 'zapretDial.outerTCP'
        case 'hysteria2': return 'zapretDial.outerQUIC'
        default: return 'zapretDial.scope'
      }
    },
    zapretOn: {
      get(): boolean { return this.dial.zapret?.enabled === true },
      set(enabled: boolean) {
        this.dial.zapret = { outboundRef: this.dial.tag, strategyRef: this.dial.zapret?.strategyRef ?? 'none', enabled }
      },
    },
    zapretStrategy: {
      get(): string { return this.dial.zapret?.strategyRef ?? 'none' },
      set(strategyRef: string) {
        this.dial.zapret = { outboundRef: this.dial.tag, strategyRef, enabled: this.zapretOn }
      },
    },
    zapretChoices(): { title: string; value: string }[] {
      const known = Object.entries(this.zapretCatalog?.catalog.records ?? {}).map(([value, item]) => ({ value, title: item.name }))
      const selected = this.zapretStrategy
      if (selected !== 'none' && !known.some(item => item.value === selected)) known.push({ value: selected, title: selected })
      return [{ value: 'none', title: String(this.$t('zapretDial.noStrategy')) }, ...known.sort((a, b) => a.title.localeCompare(b.title))]
    },
    dnsZapret() {
      return this.context === 'dns' ? boundDirect(Data().outbounds ?? [], this.dial.detour) : undefined
    },
    dnsZapretName(): string {
      const ref = this.dnsZapret?.strategyRef ?? ''
      return this.zapretCatalog?.catalog.records[ref]?.name ?? ref
    },
    dnsZapretState(): string {
      return this.zapretCatalog?.references.find(ref => ref.outboundRef === this.dnsZapret?.outboundRef && ref.strategyRef === this.dnsZapret?.strategyRef)?.state ?? 'blocked'
    },
    dnsZapretCoverage(): string {
      switch (this.dial.type) {
        case 'udp': return 'zapretDial.requiresUDPAndTCP'
        case 'quic': case 'h3': return 'zapretDial.requiresQUIC'
        default: return 'zapretDial.requiresTCP'
      }
    },
    shouldLoadZapret(): boolean { return this.hasZapret && (this.zapretEditor || Boolean(this.dnsZapret)) },
    networkTypes() { return ['wifi', 'cellular', 'ethernet', 'other'] },
    networkStrategies() { return ['fallback', 'hybrid'] },
    networkConflict(): boolean {
      return this.$props.dial.network_strategy != undefined &&
        (this.$props.dial.bind_interface != undefined ||
         this.$props.dial.inet4_bind_address != undefined ||
         this.$props.dial.inet6_bind_address != undefined ||
         this.$props.dial.tcp_fast_open === true)
    },
    networkStrategy: {
      get(): string | undefined {
        return this.$props.dial.network_strategy
      },
      set(v:string | undefined) {
        if (v == undefined || v.length == 0) {
          delete this.$props.dial.network_strategy
          delete this.$props.dial.network_type
          delete this.$props.dial.fallback_network_type
          delete this.$props.dial.fallback_delay
          return
        }
        this.$props.dial.network_strategy = v
        if (v != 'fallback') {
          delete this.$props.dial.fallback_network_type
        }
      }
    },
    connectTimeout: {
      get() { return this.$props.dial.connect_timeout ? parseInt(this.$props.dial.connect_timeout.replace('s','')) : 5 },
      set(newValue:number) { this.$props.dial.connect_timeout = newValue > 0 ? newValue + 's' : '5s' }
    },
    routingMark: {
      get() { return this.$props.dial.routing_mark?.toString() ?? '' },
      set(newValue:string) {
        const trimmed = (newValue ?? '').toString().trim()
        if (trimmed.length == 0 || trimmed == '0' || trimmed == '0x0') delete this.$props.dial.routing_mark
        else if (trimmed.startsWith('0x')) this.$props.dial.routing_mark = trimmed
        else {
          const parsed = Number(trimmed)
          if (Number.isFinite(parsed) && parsed > 0) this.$props.dial.routing_mark = parsed
          else delete this.$props.dial.routing_mark
        }
      }
    },
    fallbackDelayMs: {
      get() { return this.$props.dial.fallback_delay ? parseInt(this.$props.dial.fallback_delay.replace('ms','')) : undefined },
      set(newValue:number | undefined) {
        if (typeof newValue == 'number' && !isNaN(newValue) && newValue > 0 && newValue != 300) this.$props.dial.fallback_delay = `${newValue}ms`
        else delete this.$props.dial.fallback_delay
      }
    },
    optionDetour: {
      get(): boolean { return this.$props.dial.detour != undefined },
      set(v:boolean) { v ? this.$props.dial.detour = this.outTags[0]?? '' : delete this.$props.dial.detour }
    },
    optionBind: {
      get(): boolean { return this.$props.dial.bind_interface != undefined },
      set(v:boolean) { v ? this.$props.dial.bind_interface = '' : delete this.$props.dial.bind_interface }
    },
    optionIPV4: {
      get(): boolean { return this.$props.dial.inet4_bind_address != undefined },
      set(v:boolean) { v ? this.$props.dial.inet4_bind_address = '' : delete this.$props.dial.inet4_bind_address }
    },
    optionIPV6: {
      get(): boolean { return this.$props.dial.inet6_bind_address != undefined },
      set(v:boolean) { v ? this.$props.dial.inet6_bind_address = '' : delete this.$props.dial.inet6_bind_address }
    },
    optionBindNoPort: {
      get(): boolean { return this.$props.dial.bind_address_no_port != undefined },
      set(v:boolean) { v ? this.$props.dial.bind_address_no_port = true : delete this.$props.dial.bind_address_no_port }
    },
    optionProtect: {
      get(): boolean { return this.$props.dial.protect_path != undefined },
      set(v:boolean) { v ? this.$props.dial.protect_path = '' : delete this.$props.dial.protect_path }
    },
    optionTcpKeepAlive: {
      get(): boolean {
        return this.$props.dial.disable_tcp_keep_alive != undefined ||
               this.$props.dial.tcp_keep_alive != undefined ||
               this.$props.dial.tcp_keep_alive_interval != undefined
      },
      set(v:boolean) {
        if (v) {
          this.$props.dial.tcp_keep_alive = '5m'
          this.$props.dial.tcp_keep_alive_interval = '75s'
        } else {
          delete this.$props.dial.disable_tcp_keep_alive
          delete this.$props.dial.tcp_keep_alive
          delete this.$props.dial.tcp_keep_alive_interval
        }
      }
    },
    optionRM: {
      get(): boolean { return this.$props.dial.routing_mark != undefined },
      set(v:boolean) { v ? this.$props.dial.routing_mark = '' : delete this.$props.dial.routing_mark }
    },
    optionRA: {
      get(): boolean { return this.$props.dial.reuse_addr != undefined },
      set(v:boolean) { v ? this.$props.dial.reuse_addr = true : delete this.$props.dial.reuse_addr }
    },
    optionNetns: {
      get(): boolean { return this.$props.dial.netns != undefined },
      set(v:boolean) { v ? this.$props.dial.netns = '' : delete this.$props.dial.netns }
    },
    optionTCP: {
      get(): boolean {
        return this.$props.dial.tcp_fast_open != undefined &&
               this.$props.dial.tcp_multi_path != undefined
      },
      set(v:boolean) {
        if (v) {
          this.$props.dial.tcp_fast_open = false
          this.$props.dial.tcp_multi_path = false
        } else {
          delete this.$props.dial.tcp_fast_open
          delete this.$props.dial.tcp_multi_path
        }
      }
    },
    optionUDP: {
      get(): boolean { return this.$props.dial.udp_fragment != undefined },
      set(v:boolean) { v ? this.$props.dial.udp_fragment = true : delete this.$props.dial.udp_fragment }
    },
    optionCT: {
      get(): boolean { return this.$props.dial.connect_timeout != undefined },
      set(v:boolean) { v ? this.$props.dial.connect_timeout = '5s' : delete this.$props.dial.connect_timeout }
    },
    optionDR: {
      get(): boolean { return this.$props.dial.domain_resolver != undefined },
      set(v:boolean) { v ? (this.dnsTags.length > 0 ? this.$props.dial.domain_resolver = this.dnsTags[0] : delete this.$props.dial.domain_resolver) : delete this.$props.dial.domain_resolver }
    },
    optionNetworkStrategy: {
      get(): boolean {
        return this.$props.dial.network_strategy != undefined ||
               this.$props.dial.network_type != undefined ||
               this.$props.dial.fallback_network_type != undefined ||
               this.$props.dial.fallback_delay != undefined
      },
      set(v:boolean) {
        if (v) {
          this.$props.dial.network_strategy = 'fallback'
        } else {
          delete this.$props.dial.network_strategy
          delete this.$props.dial.network_type
          delete this.$props.dial.fallback_network_type
          delete this.$props.dial.fallback_delay
        }
      }
    },
    dnsTags() {return Data().config.dns?.servers?.map((d:any) => d.tag) ?? []}
  },
  watch: {
    shouldLoadZapret: {
      immediate: true,
      async handler(load: boolean) {
        this.zapretCatalog = undefined
        if (load) this.zapretCatalog = await readZapretSummary()
      },
    },
    'dial.tag'(tag: string) {
      if (this.zapretEditor && this.dial.zapret) this.dial.zapret.outboundRef = tag
    },
  },
  components: { DomainResolver }
})
