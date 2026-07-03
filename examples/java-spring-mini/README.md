# Java Spring Mini Sample

This sample is intentionally small and Spring-like. It does not need to compile;
the Architecture Attention Map MVP uses it as a deterministic static-analysis
target.

Intentional architecture signals:

- Security-related classes form a central authentication/token area.
- `UserRegistrationValidator` and `PaymentFraudValidator` share validation-like
  behavior without a direct structural relation.
- Payment and order workflows cross into user/security packages.
- Repository-like classes provide persistence vocabulary for topic search.

