import * as pulumi from "@pulumi/pulumi";
import * as oci from "@pulumi/oci";

const project = pulumi.getProject();
const stack = pulumi.getStack();
const config = new pulumi.Config();

// See [Protocol Numbers](http://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml).
const PROTOCOL_NUMBERS = {
  ALL: "all",
  ICMP: "1",
  TCP: "6",
  UDP: "17",
  ICMPv6: "58",
} as const;

type PROTOCOL_NAMES = keyof typeof PROTOCOL_NUMBERS;

type SecurityRuleConfig = {
  proto: PROTOCOL_NAMES;
  source: string;
  description: string;
  port?: number;
  portRange?: [number, number];
};

const defaultIngressSecurityRules: SecurityRuleConfig[] = [
  {
    proto: "TCP",
    source: "0.0.0.0/0",
    description: "ssh",
    port: 22,
  },
];

const INSTANCE_SHAPES = {
  STANDARD_A1_FLEX: "VM.Standard.A1.Flex",
  STANDARD_E2_1_MICRO: "VM.Standard.E2.1.Micro",
} as const;

// Parse config
const sshPubKey = config.require("sshPubKey").replace(/\n/g, "");
const instanceShape =
  config.get("instanceShape") ?? INSTANCE_SHAPES.STANDARD_A1_FLEX;
const instanceOcpus = config.getNumber("instanceOcpus") ?? 2;
const instanceMemoryInGbs = config.getNumber("instanceMemoryInGbs") ?? 8;
const ingressSecurityRules =
  config.getObject<SecurityRuleConfig[]>("ingressSecurityRules") ||
  defaultIngressSecurityRules;
const osImageId_ = config.get("osImageId");

// Compartment
const compartment = new oci.identity.Compartment(`${project}-${stack}`, {
  description: "vm compartment",
  enableDelete: true,
});
const compartmentId = compartment.id;

// VCN
const vcn = new oci.core.Vcn("vcn", {
  compartmentId,
  cidrBlocks: ["10.1.0.0/16"],
  isIpv6enabled: false,
});

// Security List
const secList = new oci.core.SecurityList("sec-list", {
  compartmentId,
  vcnId: vcn.id,
  egressSecurityRules: [
    {
      protocol: "all",
      destination: "0.0.0.0/0",
    },
  ],
  ingressSecurityRules: [
    // Just map rules from the config
    ...ingressSecurityRules.map((rule) => {
      const portOption = {
        min: rule.portRange?.[0] ?? rule.port,
        max: rule.portRange?.[1] ?? rule.port,
      };
      const protocol = PROTOCOL_NUMBERS[rule.proto];
      const isTcp = protocol == PROTOCOL_NUMBERS.TCP;
      const isUdp = protocol == PROTOCOL_NUMBERS.UDP;
      const isAll = protocol == PROTOCOL_NUMBERS.ALL;

      return {
        protocol,
        description: rule.description,
        source: rule.source,
        tcpOptions: isTcp || isAll ? portOption : undefined,
        udpOptions: isUdp || isAll ? portOption : undefined,
      };
    }),
  ],
});

// Subnet
const subnet = new oci.core.Subnet("subnet", {
  compartmentId,
  vcnId: vcn.id,
  cidrBlock: "10.1.0.0/24",
  securityListIds: [vcn.defaultSecurityListId, secList.id],
  prohibitPublicIpOnVnic: false,
});

// Internet Gateway
const ig = new oci.core.InternetGateway("ig", {
  compartmentId,
  vcnId: vcn.id,
  enabled: true,
});

// Route Table
new oci.core.DefaultRouteTable("route-table", {
  compartmentId,
  manageDefaultResourceId: vcn.defaultRouteTableId,
  routeRules: [
    {
      networkEntityId: ig.id,
      destination: "0.0.0.0/0",
      destinationType: "CIDR_BLOCK",
    },
  ],
});

// Get OS Image
const osImageId =
  osImageId_ ||
  compartment.id.apply((compartmentId) =>
    oci.core
      .getImages({
        compartmentId,
        operatingSystem: "Canonical Ubuntu",
        operatingSystemVersion: "22.04",
        sortBy: "TIMECREATED",
        sortOrder: "DESC",
        shape: instanceShape,
      })
      .then((v) => v.images[0].id)
  );

const availabilityDomainName = compartment.id.apply((compartmentId) =>
  oci.identity
    .getAvailabilityDomains({
      compartmentId,
    })
    .then((v) => v.availabilityDomains[0].name)
);

// VM Instance
const instance = new oci.core.Instance(
  "instance",
  {
    compartmentId,
    availabilityDomain: availabilityDomainName,
    displayName: stack,
    shape: instanceShape,
    shapeConfig: {
      ocpus: instanceOcpus,
      memoryInGbs: instanceMemoryInGbs,
    },
    sourceDetails: {
      sourceType: "image",
      sourceId: osImageId,
    },
    createVnicDetails: {
      assignPublicIp: "true",
      subnetId: subnet.id,
    },
    metadata: {
      // You can inject cloud-init.yaml here.
      // user_data: Buffer.from("").toString("base64"),
      ssh_authorized_keys: sshPubKey,
    },
  },
  // Just prevent Pulumi from replacing the instance on the metadata change.
  { ignoreChanges: ["metadata"] }
);

// Output
export const compartmentName = compartment.name;
export const instanceIp = instance.publicIp;
export const osImageIdSelected = osImageId;
