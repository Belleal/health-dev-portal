---
title: Environments
summary: The addresses of NHIS's test and production environments and of the hospitals' dedicated access, which version of the specifications runs in each, and where to see their status.
updated: 2026-11-17
---
Developers work with two NHIS environments: the public test environment and production. Hospitals also have dedicated,
redundant access to NHIS over a separate network.

## Addresses {#overview}

| Access | Authentication | Requests |
|---|---|---|
| Public test environment | `ptest-auth.his.bg` | `ptest-api.his.bg` |
| Production environment | `auth.his.bg` | `api.his.bg` |
| Hospitals' dedicated access | `hospital-auth.his.bg` | `hospital-api.his.bg` |

Every address is HTTPS. The token comes from `/token` on the authentication address, as
[Getting started](/en/guides/getting-started#token) describes, and goes to the requests address of the same access.

## Which version runs where {#versions}

Every version of a specification moves through stages:

- **Testing:** the version runs in the public test environment. This is the integration period before production.
- **Production:** the version runs in the production environment.
- **Previous production:** the production version it replaced, backward compatible until an announced date.

Which version of each module is in testing and which in production is on the [home page](/en/). A module whose testing
version is ahead of production is marked. How new versions are announced is in
[Changes and dates](/en/guides/getting-started#changes).

## Status {#status}

Whether each environment is working normally, and the planned maintenance, are on the
[environment status](/en/status) page, with a feed (Atom). The home page's band shows the status too.

## Hospitals' dedicated access {#hospital-network}

Hospitals have dedicated, redundant and secure access to NHIS over a separate network (SD-WAN), with these names:

- `hospital-auth.his.bg` for authentication;
- `hospital-api.his.bg` for requests;
- `hospital-cc.his.bg` to check the connection, with no token.

This access follows the same specifications as the public access at `auth.his.bg` and `api.his.bg`. The hospital's
software is configured with these names.

Access is by name only: the addresses are found through the DNS servers that serve his.bg, never through fixed entries
such as the `hosts` file. For a network problem, contact the people who run the hospital's network, and the network's
provider.

The details will be in the secure network guide. Until then, see the old
[secure information network instructions](https://www.his.bg/upload/285/%D0%98%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%86%D0%B8%D0%B8+%D0%B7%D0%B0+%D1%81%D0%B8%D0%B3%D1%83%D1%80%D0%BD%D0%B0+%D0%B8%D0%BD%D1%84%D0%BE%D1%80%D0%BC%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%BD%D0%B0+%D0%BC%D1%80%D0%B5%D0%B6%D0%B0+v.1.0.0.pdf)
(PDF in Bulgarian, version 1.0.0).
