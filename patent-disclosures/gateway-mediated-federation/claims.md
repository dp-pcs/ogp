# Draft Patent Claims

## Independent Claims

### Claim 1: Method for Gateway-Mediated Agent Federation (Broadest)

A method for enabling collaboration between autonomous AI agents operating behind separate gateway boundaries, the method comprising:

(a) establishing a first gateway system that mediates access to a first autonomous AI agent, wherein said first autonomous AI agent is a computational process not directly addressable from external networks;

(b) establishing a second gateway system that mediates access to a second autonomous AI agent, wherein said second autonomous AI agent is a computational process not directly addressable from external networks;

(c) generating a cryptographic identity for said first gateway system using a public key cryptography algorithm;

(d) generating a cryptographic identity for said second gateway system using said public key cryptography algorithm;

(e) negotiating a bilateral scope agreement between said first gateway system and said second gateway system, wherein said bilateral scope agreement specifies:
    (i) one or more intents representing semantically meaningful capabilities that may be invoked,
    (ii) zero or more topic restrictions associated with each intent, and
    (iii) rate limits associated with each intent;

(f) receiving, at said second gateway system, a federation message from said first gateway system, wherein said federation message comprises:
    (i) an intent identifier,
    (ii) a payload containing intent-specific data,
    (iii) a cryptographic signature generated using a private key corresponding to said first gateway system's cryptographic identity;

(g) verifying, by said second gateway system, that said cryptographic signature is valid using a public key corresponding to said first gateway system's cryptographic identity;

(h) validating, by said second gateway system, that said intent identifier and said payload are covered by said bilateral scope agreement prior to routing said federation message to said second autonomous AI agent; and

(i) routing said federation message to said second autonomous AI agent only after said validating step confirms authorization,

whereby said first autonomous AI agent and said second autonomous AI agent collaborate across organizational boundaries while remaining behind their respective gateway boundaries.

---

### Claim 2: System for Gateway-Mediated Agent Federation (Broadest System Claim)

A system for enabling collaboration between autonomous AI agents operating behind separate gateway boundaries, the system comprising:

(a) a first gateway comprising:
    (i) a first processor,
    (ii) a first memory storing a first private key and a first public key generated using an elliptic curve cryptography algorithm,
    (iii) a first network interface for receiving federation messages,
    (iv) a first enforcement module configured to validate incoming federation messages against stored scope grants prior to routing to a first autonomous AI agent;

(b) a second gateway comprising:
    (i) a second processor,
    (ii) a second memory storing a second private key and a second public key generated using said elliptic curve cryptography algorithm,
    (iii) a second network interface for receiving federation messages,
    (iv) a second enforcement module configured to validate incoming federation messages against stored scope grants prior to routing to a second autonomous AI agent;

(c) a scope negotiation module configured to establish bilateral scope agreements between said first gateway and said second gateway, wherein each scope agreement specifies:
    (i) one or more intents representing semantically meaningful capabilities,
    (ii) optional topic restrictions for each intent,
    (iii) rate limits for each intent;

(d) a signature generation module configured to generate cryptographic signatures over federation messages using said private keys;

(e) a signature verification module configured to verify cryptographic signatures on incoming federation messages using said public keys; and

(f) a message routing module configured to route validated federation messages from said gateways to said autonomous AI agents,

whereby said autonomous AI agents collaborate across organizational boundaries while remaining computationally isolated behind their respective gateways.

---

## Dependent Claims - Method Refinements

### Claim 3: Ed25519 Cryptographic Identity

The method of Claim 1, wherein said public key cryptography algorithm is Ed25519, and wherein:

(a) said cryptographic identity comprises a public key of 32 bytes and a private key of 32 bytes;

(b) said cryptographic signature comprises a 64-byte signature generated using Ed25519 signature algorithm; and

(c) said verifying step uses Ed25519 signature verification with computational complexity of O(log n) where n = 256 bits.

---

### Claim 4: Three-Layer Scope Isolation Model

The method of Claim 1, wherein said bilateral scope agreement implements a three-layer scope isolation model comprising:

(a) Layer 1 - Gateway Capabilities: said first gateway system and said second gateway system each advertise a set of intents they are capable of supporting;

(b) Layer 2 - Peer Negotiation: during bilateral approval, said first gateway system and said second gateway system exchange scope bundles specifying which intents from Layer 1 they grant to each other; and

(c) Layer 3 - Runtime Enforcement: upon receiving a federation message, said second gateway system validates said intent identifier against the scope bundle granted to said first gateway system before routing to said second autonomous AI agent.

---

### Claim 5: Symmetric Scope Mirroring

The method of Claim 1, wherein said negotiating step comprises:

(a) receiving, at said second gateway system, a federation request from said first gateway system, wherein said federation request includes a first scope bundle specifying intents offered by said first gateway system;

(b) approving said federation request at said second gateway system;

(c) automatically generating a second scope bundle that mirrors said first scope bundle; and

(d) transmitting said second scope bundle to said first gateway system as part of an approval response,

whereby said bilateral scope agreement is symmetric by default without requiring separate configuration on each side.

---

### Claim 6: Asymmetric Scope Override

The method of Claim 5, further comprising:

(a) detecting an asymmetric flag in said approving step; and

(b) when said asymmetric flag is present, generating said second scope bundle with a different set of intents than said first scope bundle,

whereby said bilateral scope agreement supports asymmetric trust relationships when explicitly requested.

---

### Claim 7: Exact Intent Matching with Topic Prefix Matching

The method of Claim 1, wherein said validating step comprises:

(a) performing exact string matching on said intent identifier against intents listed in said bilateral scope agreement, wherein no wildcard matching is performed on intent identifiers;

(b) when said payload contains a topic field, extracting a topic value from said topic field;

(c) performing prefix matching on said topic value against a list of allowed topics in said bilateral scope agreement, wherein:
    (i) an exact match succeeds if said topic value equals an allowed topic,
    (ii) a prefix match succeeds if said topic value starts with an allowed topic followed by a forward slash; and

(d) denying said federation message if either said intent identifier does not exactly match or said topic value does not match via exact or prefix matching.

---

### Claim 8: Six-Step Doorman Validation

The method of Claim 1, wherein said validating step comprises, in order:

(a) Step 1: Peer Lookup - retrieving a peer record associated with said first gateway system's cryptographic identity;

(b) Step 2: Approval Status Check - confirming said peer record has an approval status of "approved";

(c) Step 3: Scope Bundle Determination - retrieving a scope bundle from said peer record or assigning a default scope bundle for backward compatibility;

(d) Step 4: Intent Grant Lookup - searching said scope bundle for a scope grant matching said intent identifier;

(e) Step 5: Topic Coverage Check - verifying that said payload's topic, if present, is covered by said scope grant using exact or prefix matching; and

(f) Step 6: Rate Limit Check - validating that a rate limit associated with said scope grant has not been exceeded for said first gateway system and said intent identifier,

wherein said federation message is denied if any of said six steps fails validation.

---

### Claim 9: Sliding Window Rate Limiting with Precise Retry-After

The method of Claim 8, wherein said Rate Limit Check comprises:

(a) maintaining, in memory, a rate limit entry for a combination of said first gateway system's cryptographic identity and said intent identifier, wherein said rate limit entry comprises an array of request timestamps;

(b) filtering said array to remove timestamps outside a sliding time window defined by said rate limit;

(c) determining if a count of remaining timestamps equals or exceeds a maximum request count defined by said rate limit;

(d) when said count equals or exceeds said maximum request count:
    (i) identifying an oldest timestamp in said array,
    (ii) calculating a retry-after value as: (oldest timestamp + window duration) - current time,
    (iii) returning a denial with said retry-after value; and

(e) when said count is below said maximum request count:
    (i) appending current time to said array,
    (ii) allowing said federation message to proceed,

whereby said retry-after value precisely indicates when said first gateway system may retry said intent invocation.

---

### Claim 10: Hierarchical Topic Policy Resolution

The method of Claim 1, further comprising:

(a) configuring, at said second gateway system, a set of response policies, wherein each response policy comprises:
    (i) a topic pattern,
    (ii) a response level selected from: off, notifications-only, or interactive,
    (iii) an optional peer identifier;

(b) upon receiving said federation message, resolving an effective response policy using a four-level fallthrough hierarchy:
    (i) Level 1: selecting a peer-specific topic policy if said first gateway system's identifier matches said optional peer identifier and said payload's topic matches said topic pattern,
    (ii) Level 2: if Level 1 fails, selecting a global topic policy where said optional peer identifier is null and said payload's topic matches said topic pattern,
    (iii) Level 3: if Level 2 fails, selecting a peer-specific wildcard policy where said first gateway system's identifier matches and said topic pattern is "*",
    (iv) Level 4: if Level 3 fails, selecting a global wildcard policy where said optional peer identifier is null and said topic pattern is "*";

(c) when said response level is "off", sending a cryptographically-signed rejection message to said first gateway system without routing to said second autonomous AI agent; and

(d) when said response level is "notifications-only" or "interactive", routing said federation message to said second autonomous AI agent with corresponding interaction constraints.

---

### Claim 11: Stable Identity Across Network Address Changes

The method of Claim 1, wherein:

(a) said first gateway system's cryptographic identity comprises a public key from which a peer identifier is derived as a first N characters of said public key in hexadecimal encoding;

(b) said first gateway system is initially associated with a first network address;

(c) detecting that said first network address has changed to a second network address;

(d) receiving, at said second gateway system, a federation message from said second network address signed with a private key corresponding to said first gateway system's public key;

(e) verifying said cryptographic signature confirms said federation message originated from said first gateway system despite change in network address;

(f) automatically updating a stored network address for said first gateway system from said first network address to said second network address; and

(g) continuing to route subsequent federation messages from said first gateway system using said second network address,

whereby said first gateway system's identity remains stable across network address changes caused by tunnel rotation, DHCP reassignment, or network infrastructure changes.

---

## Dependent Claims - System Refinements

### Claim 12: System with Three-Layer Enforcement

The system of Claim 2, wherein said first enforcement module and said second enforcement module each implement a three-layer enforcement architecture comprising:

(a) a signature verification layer that validates cryptographic signatures on all incoming federation messages;

(b) a scope validation layer that validates intent identifiers and optional topic values against stored scope grants; and

(c) a rate limiting layer that validates request counts against configured rate limits on a per-peer, per-intent basis.

---

### Claim 13: System with File-Based Atomic Peer Storage

The system of Claim 2, wherein said first memory and said second memory each store peer relationship data using a file-based storage mechanism comprising:

(a) a peer registry file containing a list of peer records, wherein each peer record comprises:
    (i) a peer identifier derived from a public key,
    (ii) a gateway URL,
    (iii) said public key,
    (iv) an approval status,
    (v) a scope bundle specifying granted intents;

(b) an atomic write mechanism that:
    (i) writes updated peer relationship data to a temporary file,
    (ii) performs an atomic file system rename operation from said temporary file to said peer registry file,

whereby race conditions during concurrent peer data updates are prevented.

---

### Claim 14: System with In-Memory Rate Limit Tracking

The system of Claim 2, wherein said first enforcement module and said second enforcement module each comprise:

(a) an in-memory data structure storing rate limit entries, wherein each rate limit entry is indexed by a composite key comprising a peer identifier and an intent identifier;

(b) each rate limit entry comprising:
    (i) an array of request timestamps,
    (ii) a window start timestamp;

(c) a rate limit checking function that:
    (i) filters said array to remove timestamps outside a sliding window,
    (ii) compares a count of remaining timestamps against a maximum request count,
    (iii) calculates a precise retry-after value when said count equals or exceeds said maximum request count; and

(d) a cleanup process that periodically removes rate limit entries inactive for longer than a threshold duration,

whereby rate limiting operates with memory-efficient sliding windows and automatic cleanup of stale entries.

---

## Method Claims for Specific Features

### Claim 15: Method for Peer Approval with Automatic Scope Mirroring

A method for establishing a bilateral trust relationship between gateway systems mediating access to autonomous AI agents, the method comprising:

(a) generating, at a first gateway system, a federation request comprising:
    (i) a first cryptographic identity,
    (ii) a first scope bundle listing intents offered by said first gateway system,
    (iii) a cryptographic signature;

(b) transmitting said federation request from said first gateway system to a second gateway system;

(c) receiving, at said second gateway system, said federation request;

(d) verifying, at said second gateway system, said cryptographic signature;

(e) presenting said federation request to an administrator of said second gateway system for approval;

(f) receiving approval input from said administrator;

(g) generating, at said second gateway system, a second scope bundle that mirrors said first scope bundle;

(h) storing, at said second gateway system, said first scope bundle as grants for said first gateway system;

(i) generating an approval message comprising said second scope bundle and a cryptographic signature;

(j) transmitting said approval message from said second gateway system to said first gateway system;

(k) receiving, at said first gateway system, said approval message; and

(l) storing, at said first gateway system, said second scope bundle as grants for said second gateway system,

whereby bilateral trust is established with symmetric scope grants requiring configuration on only one side.

---

### Claim 16: Method for Cryptographically-Attested Denial

A method for denying unauthorized agent capability invocations while preventing information leakage, the method comprising:

(a) receiving, at a gateway system, a federation message from a peer gateway system, wherein said federation message specifies an intent and a topic;

(b) determining that said topic is not allowed for said peer gateway system based on a hierarchical topic policy configuration;

(c) selecting a randomized denial message from a predefined set of vague denial messages, wherein said denial messages do not confirm or deny the existence of said topic;

(d) generating a cryptographic signature over a denial response comprising said randomized denial message;

(e) transmitting said denial response with said cryptographic signature to said peer gateway system; and

(f) not routing said federation message to an autonomous AI agent,

whereby said peer gateway system receives cryptographic proof that said federation message was received and explicitly denied, without learning whether said topic exists in said gateway system's configuration.

---

### Claim 17: Method for Multi-Organizational Project Isolation

A method for enforcing project-level access control in a federated agent environment, the method comprising:

(a) creating, at a first gateway system, a project record comprising:
    (i) a project identifier,
    (ii) a list of member peer identifiers authorized to access said project;

(b) establishing bilateral federation relationships between said first gateway system and a plurality of peer gateway systems;

(c) receiving, at said first gateway system, a project query message from a second gateway system, wherein said project query message specifies said project identifier;

(d) validating that said second gateway system has a bilateral federation relationship with said first gateway system;

(e) validating that said second gateway system has been granted a project query intent in a scope bundle;

(f) performing a membership check to determine if said second gateway system's peer identifier is included in said list of member peer identifiers;

(g) when said membership check fails, denying said project query message with a membership error; and

(h) when said membership check succeeds, processing said project query message and returning project data,

whereby project-level access control composes with gateway-level federation, ensuring that bilateral federation relationships do not grant transitive access to all projects.

---

## Apparatus Claims

### Claim 18: Gateway Apparatus for Mediating Agent Federation

An apparatus for mediating access to autonomous AI agents while enabling federated collaboration, the apparatus comprising:

(a) a processor;

(b) a network interface configured to receive federation messages via HTTPS;

(c) a non-volatile memory storing:
    (i) a private key and a corresponding public key generated using Ed25519 elliptic curve cryptography,
    (ii) a peer registry file containing records of federated peer gateways,
    (iii) configuration data including response policies and default rate limits;

(d) a volatile memory storing:
    (i) rate limit tracking data structures indexed by peer identifier and intent identifier,
    (ii) cached scope bundles for active peer relationships;

(e) computer-executable instructions stored in said non-volatile memory that, when executed by said processor, cause said apparatus to:
    (i) receive a federation message from a peer gateway via said network interface,
    (ii) verify a cryptographic signature on said federation message using a peer's public key,
    (iii) validate that an intent specified in said federation message is covered by a scope grant for said peer,
    (iv) validate that a topic specified in said federation message, if any, is allowed by said scope grant,
    (v) validate that a rate limit for said intent has not been exceeded,
    (vi) route said federation message to an autonomous AI agent only after all validations succeed; and

(f) an agent communication interface for transmitting validated federation messages to said autonomous AI agent,

whereby said apparatus enforces gateway-mediated federation while preserving containment of said autonomous AI agent.

---

### Claim 19: Computer-Readable Medium

A non-transitory computer-readable medium storing instructions that, when executed by a processor of a gateway system, cause said gateway system to perform the method of Claim 1.

---

### Claim 20: Computer-Readable Medium for Doorman Enforcement

A non-transitory computer-readable medium storing instructions that, when executed by a processor of a gateway system, cause said gateway system to:

(a) receive a federation message from a peer gateway system, wherein said federation message comprises an intent identifier, a payload, and a cryptographic signature;

(b) perform a six-step validation process comprising:
    (i) retrieving a peer record for said peer gateway system,
    (ii) confirming said peer record has approval status,
    (iii) retrieving a scope bundle from said peer record,
    (iv) locating a scope grant for said intent identifier in said scope bundle,
    (v) validating that a topic in said payload is covered by said scope grant,
    (vi) validating that a rate limit for said intent identifier has not been exceeded;

(c) deny said federation message if any step of said validation process fails; and

(d) route said federation message to an autonomous AI agent if all steps of said validation process succeed,

whereby said autonomous AI agent is protected from unauthorized capability invocations.

---

## Summary of Claim Scope

| Claim # | Type | Scope | Key Features |
|---------|------|-------|--------------|
| 1 | Method (Independent) | Broadest | Gateway-mediated federation with scope negotiation |
| 2 | System (Independent) | Broadest | Multi-gateway system with enforcement modules |
| 3 | Method (Dependent) | Ed25519 | Specific cryptographic algorithm |
| 4 | Method (Dependent) | Three-layer scope model | Layer 1/2/3 isolation |
| 5 | Method (Dependent) | Symmetric mirroring | Automatic bilateral grants |
| 6 | Method (Dependent) | Asymmetric override | Support for asymmetric trust |
| 7 | Method (Dependent) | Intent/topic matching | Exact + prefix matching rules |
| 8 | Method (Dependent) | Doorman validation | Six-step enforcement process |
| 9 | Method (Dependent) | Rate limiting | Sliding window with precise retry-after |
| 10 | Method (Dependent) | Topic policies | Four-level hierarchical fallthrough |
| 11 | Method (Dependent) | Stable identity | Public-key-based identity across URL changes |
| 12 | System (Dependent) | Three-layer enforcement | System-level enforcement architecture |
| 13 | System (Dependent) | Atomic storage | File-based peer storage with atomic writes |
| 14 | System (Dependent) | Rate tracking | In-memory sliding window tracking |
| 15 | Method (Independent) | Peer approval | Bilateral trust establishment |
| 16 | Method (Independent) | Attested denial | Cryptographic denial without info leakage |
| 17 | Method (Independent) | Project isolation | Multi-level access control composition |
| 18 | Apparatus | Gateway device | Physical/virtual gateway apparatus |
| 19 | Computer-readable medium | Storage medium | General method embodiment |
| 20 | Computer-readable medium | Storage medium | Doorman enforcement embodiment |

---

## Claim Drafting Notes

**Broadest Defensible Scope** (Claims 1-2):
- Core innovation: gateway-mediated federation with bilateral scope negotiation
- Does NOT require: specific crypto algorithm, specific rate limit implementation, specific storage mechanism
- Essential elements: gateways mediating access, cryptographic identity, bilateral scope agreement, validation before routing

**Medium Scope** (Claims 3-14):
- Add specific implementations: Ed25519, three-layer model, symmetric mirroring, doorman validation
- Each dependent claim can stand alone or be combined with others
- Covers OGP's specific innovations (doorman, topic policies, precise retry-after)

**Narrow Scope** (Claims 15-20):
- Focus on specific features: peer approval flow, attested denial, project isolation
- Alternative claim formats: method, system, apparatus, computer-readable medium
- Provides fallback positions if broader claims are challenged

**Strategic Coverage**:
- Independent claims cover core invention from multiple angles (method, system)
- Dependent claims ladder down from broad to specific implementations
- Alternative independent claims (15-17) cover key features as standalone inventions
- Apparatus and medium claims (18-20) cover deployment and distribution

**Prior Art Differentiation**:
All claims explicitly require gateway mediation and bilateral scope negotiation, which distinguishes OGP from:
- A2A/MCP (direct agent exposure)
- ActivityPub/Matrix (social semantics, no scope negotiation)
- OAuth (centralized, not bilateral P2P)
- VPN/firewall (network layer, not application layer)
