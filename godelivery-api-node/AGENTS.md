# AGENTS.md

Esta API pertence exclusivamente à comparação NestJS/Angular em `angular-node-graphql`. Preserve os arquivos da aplicação .NET fora desta pasta

- Use Node.js 26.13.0 e os lockfiles locais
- Preserve os limites dos módulos Identity, Motorcycles, Deliveriers, Rentals, Notifications e Database
- O provedor OAuth/OIDC é integrado ao Nest; GraphQL é o contrato principal, e CNH usa REST para arquivo
- A observabilidade local é Pino, OpenTelemetry, Prometheus, Tempo, Loki e Grafana, conforme `../README.md`
- Após mudanças, execute testes unitários, build e a coleção Newman com a stack Compose ativa
