# pulumi-oci-vm-stack

Spinning up a Ubuntu VM instance with [Oracle Cloud's Always Free Tier](https://www.oracle.com/cloud/free/).  
As of writing this, they offers;

- Two x64 VMs with 1/8 OCPU and 1 GB memory each
- Up to four arm64 VMs with 8 cores and 24 GB of memory in total (splittable to 1~4 VMs)

## TL;DR

- Make sure you have
  - `~/.oci/config` and your key pair. See [How to Generate an API Signing Key](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm).
  - Pulumi `curl -fsSL https://get.pulumi.com | sh` or `asdf plugin-add && asdf install pulumi latest && asdf global pulumi latest`
  - Node.js >= v16

```sh
$ npm ci

$ pulumi login file://.
$  export PULUMI_CONFIG_PASSPHRASE=your-pass-phrase
$ pulumi stack init dev

$ pulumi config set sshPubKey "$(< /path/to/pub_key.rsa)"
$ pulumi up -y

# Have a fun! Sometime it takes several minutes to be ready.
$ ssh ubuntu@$(pulumi stack output instanceIp) -i ~/.ssh/your_key.rsa
```

```sh
# Clean up
$ pulumi destroy
```

## Pulumi configs

- `sshPubKey`
  - Required.
  - The SSH Public key to be added to `/home/ubuntu/.ssh/authorized_keys`.
- `ingressSecurityRules`
  - The list of ingress security rules. If not specified, only SSH(22) is allowed.
  - You may want to edit `Pulumi.<stack>.yaml` manually.
  ```yaml
  # For example:
  oci-vm-stack:ingressSecurityRules:
    - proto: TCP # "ALL" | "ICMP" | "TCP" | "UDP" | "ICMPv6"
      source: "0.0.0.0/0"
      description: http
      port: 80
    - proto: UDP
      source: "0.0.0.0/0"
      description: myapp
      portRange: [3000, 3020] # Open 3000-3020/udp
  ```
- `instanceShape`
  - The VM instance shape. `VM.Standard.A1.Flex | VM.Standard.E2.1.Micro`
  - Default: `VM.Standard.A1.Flex`
  - See also https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm
- `instanceOcpus`
  - The number of OCPUs assigned to the instance.
  - Default: `2`
- `instanceMemoryInGbs`
  - The amount of RAM assigned to the instance, in GiB.
  - Default: `8`

```sh
# Use x64 VM
$ pulumi config set instanceShape VM.Standard.E2.1.Micro
$ pulumi config set instanceOcpus 1
$ pulumi config set instanceMemoryInGbs 1

# Use arm64 VM (8 OCPUs, 24 GiB RAM)
$ pulumi config set instanceShape VM.Standard.A1.Flex
$ pulumi config set instanceOcpus 8
$ pulumi config set instanceMemoryInGbs 24
```
