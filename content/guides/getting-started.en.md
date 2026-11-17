---
title: Getting started
summary: How an information system connects to NHIS — the environments, a qualified electronic signature, the access token, signed messages and the first request.
updated: 2026-11-17
---
This page is for developers connecting their software to Bulgaria's National Health Information System (NHIS, НЗИС)
for the first time. It takes the steps in the order you will need them, and links to the details.

## What the NHIS API is {#what}

NHIS offers its business services through a public API: a programming interface reachable from the internet at a known
address, with no VPN. Public does not mean open: every system authenticates before it can use the services.

Requests travel over HTTPS, and requests and responses are XML messages. A request and its response are two messages
with consecutive codes, such as C001 and C002 for retrieving code lists. The messages are described module by module
in [Specifications](/en/specs).

## Environments {#environments}

There is a public test environment and a production environment, each with its own address for authentication and its
own address for requests. Start with the test environment. The addresses, and which version of the specifications runs
in each environment, are in the [Environments](/en/guides/environments) guide.

## Qualified electronic signature {#certificate}

You need a valid certificate for a qualified electronic signature (QES; in Bulgarian, КЕП). Your system uses it to get
an access token (the next step), and it signs the messages.

Requests that need a signature are signed with the QES of the employee who sends them — see
[the question about laboratory staff](/en/faq#lab-staff). Some requests need no signature, such as C001, which
retrieves code lists.

## Access token {#token}

The services at `https://api.his.bg` (in the test environment, `https://ptest-api.his.bg`) expect a Bearer token in the
`Authorization` header. The token comes from a separate address: `https://auth.his.bg/token` (in the test environment,
`https://ptest-auth.his.bg/token`).

The usual way is a GET request to that address with your QES certificate as the client certificate. On success, the
answer is an XML message:

```xml
<nhis:message xmlns:nhis="https://www.his.bg">
  <nhis:contents>
    <nhis:accessToken value="…" dataType="[string]"/>
    <nhis:tokenType value="bearer" dataType="[string]"/>
    <nhis:expiresIn value="7200" dataType="[positiveInt]"/>
    <nhis:issuedOn value="…" dataType="[dateTime]"/>
    <nhis:expiresOn value="…" dataType="[dateTime]"/>
  </nhis:contents>
</nhis:message>
```

Every request to the API then carries the token in its header:

```text
Authorization: Bearer …
```

`expiresIn` is the token's longest lifetime, in seconds. When the token expires or is revoked, the API answers 401
(Unauthorized). Get a new token then.

**Without a client certificate.** If the request to `/token` has no client certificate, the answer is 401 with an XML
message holding a `challenge`. Sign that message with your QES, in the same format (XMLDSig) as every other message,
and POST it to the same address. On success, the answer is the same as above.

## Signing messages {#signing}

The signature follows W3C's XML Signature specification (XMLDSig, https://www.w3.org/TR/xmldsig-core/). It covers the
whole message and holds the certificate. The content and structure of the `Signature` element are not changed, and
follow that specification — see [the question about the signature's format](/en/faq#signature-format).

The signature's schema, `xmldsig-core-schema.xsd`, is beside the XSDs of every version in [Schemas](/en/schemas).

## The first message {#first-message}

1. Choose the module and the message in [Specifications](/en/specs). The message's page shows each of its elements, its
   conditions, a sample message and its XSD. The sample is synthetic: every element once, with values its XSD accepts.
2. Coded values come from the code lists. Each list is in [Nomenclatures](/en/nomenclatures), with JSON and CSV
   downloads. Your system can also retrieve them with request C001, which needs no signature.
3. Check your message against the XSD of the version you work with, from [Schemas](/en/schemas).
4. If NHIS answers with an error, its code is explained in [Errors](/en/errors).

## Changes and dates {#changes}

Every new version of a specification runs first in the test environment, then in production. When a version enters
testing, it is announced with its integration period and its planned production date. The production version it
replaces stays on as previous production, backward compatible until an announced date.

What changes and when is in [Changes](/en/changes): each version's notes, a comparison of any two versions, and feeds
(Atom).

## Questions {#questions}

Answers to other developers' questions are in [FAQ](/en/faq).
