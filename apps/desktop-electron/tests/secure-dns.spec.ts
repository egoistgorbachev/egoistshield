import { describe, expect, it } from "vitest";
import {
	createSecureDnsContextProfile,
	getEffectiveDnsMode,
	parseCustomDnsUrl,
} from "../shared/secure-dns";

describe("secure dns helpers", () => {
	it("распознаёт custom режим только при включённом secure DNS и непустом URL", () => {
		expect(
			getEffectiveDnsMode({
				fakeDns: false,
				customDnsUrl: "https://dns.example.com/dns-query",
			}),
		).toBe("auto");
		expect(getEffectiveDnsMode({ fakeDns: true, customDnsUrl: "" })).toBe(
			"secure",
		);
		expect(
			getEffectiveDnsMode({
				fakeDns: true,
				customDnsUrl: "https://dns.example.com/dns-query",
			}),
		).toBe("custom");
	});

	it("разбирает DoH URL с кастомным портом и путём", () => {
		expect(
			parseCustomDnsUrl("https://dns.astronia.space:8443/dns-query/b4bb465a"),
		).toEqual({
			url: "https://dns.astronia.space:8443/dns-query/b4bb465a",
			server: "dns.astronia.space",
			serverPort: 8443,
			path: "/dns-query/b4bb465a",
			hostnameRequiresResolver: true,
		});
	});

	it("строит отдельный context profile для custom DoH", () => {
		expect(
			createSecureDnsContextProfile({ fakeDns: false, customDnsUrl: "" }),
		).toBe("auto-dns");
		expect(
			createSecureDnsContextProfile({ fakeDns: true, customDnsUrl: "" }),
		).toBe("secure-dns");
		expect(
			createSecureDnsContextProfile({
				fakeDns: true,
				customDnsUrl: "https://dns.astronia.space:8443/dns-query/b4bb465a",
			}),
		).toBe(
			"custom-dns:https%3A%2F%2Fdns.astronia.space%3A8443%2Fdns-query%2Fb4bb465a",
		);
	});
});
