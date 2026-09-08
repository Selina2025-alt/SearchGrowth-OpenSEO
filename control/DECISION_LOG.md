# DECISION LOG

Append Controller decisions that do not replace Accepted ADRs.

## 2026-09-08 — T107 same-Project GEO mention integrity

Product Owner approved a minimal forward-only contract expansion for T107. It may add explicit Project keys and database composite foreign keys required to prove that a GeoEntityMention, its concrete GeoObservationParse, and its TrackedEntity belong to the same Project. Historical accepted migrations remain immutable; no runtime parser/provider/CRUD/UI behavior, business uniqueness, ADR change, credential, publishing, paid, or production action is authorized.
