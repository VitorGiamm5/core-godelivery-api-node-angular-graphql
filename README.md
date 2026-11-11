# GoDelivery — NestJS + Angular

Aplicação independente para comparação técnica entre uma API NestJS/GraphQL e uma interface Angular. O repositório inclui execução local com Docker Compose, banco PostgreSQL, RabbitMQ, armazenamento compatível com S3 e stack de observabilidade.

A aplicação .NET usada na comparação pertence a outro diretório e não é necessária para executar este projeto.

## Arquitetura

~~~~text
Angular 22 ── OIDC Authorization Code + PKCE ── NestJS 12
   │                                             ├─ Identity / OIDC
   └──────────── GraphQL + JWT ─────────────────├─ Motorcycles
                                                 ├─ Deliveriers + CNH → MinIO
                                                 ├─ Rentals
                                                 ├─ Notifications → RabbitMQ
                                                 └─ Prisma → PostgreSQL
                                 OpenTelemetry → Collector → Tempo / Prometheus
                                 Pino ───────────────────────→ Loki → Grafana
~~~~

GraphQL é a interface principal da API. Health checks, sessão e arquivos da CNH usam HTTP. A documentação completa está em [docs/API.md](docs/API.md).

## Requisitos

- Docker Desktop com Docker Compose ativo
- Node.js 26.13.0 e npm 12.2.2 para executar testes e scripts Node localmente
- Git para clonar e atualizar o projeto

## Executar localmente

1. Clone o repositório e entre na pasta do projeto
2. Copie o exemplo de ambiente:

   PowerShell:

   ~~~~powershell
   Copy-Item .env.example .env
   ~~~~

   macOS/Linux:

   ~~~~sh
   cp .env.example .env
   ~~~~

3. Edite o arquivo .env. Gere valores independentes para as senhas e o segredo de cookie. Por exemplo, execute o comando abaixo uma vez para cada campo secreto e copie o resultado para o campo correspondente:

   ~~~~sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ~~~~

   Preencha POSTGRES_PASSWORD, RABBITMQ_PASSWORD, S3_SECRET_KEY, ADMIN_PASSWORD, OIDC_COOKIE_SECRET e GRAFANA_ADMIN_PASSWORD. ADMIN_PASSWORD precisa ter ao menos 12 caracteres; OIDC_COOKIE_SECRET precisa ter ao menos 32. Os campos de senha vêm vazios de propósito.

4. Inicie a stack:

   ~~~~sh
   docker compose up -d --build
   docker compose ps
   ~~~~

5. Acesse a interface em http://localhost:9100 e autentique-se usando ADMIN_EMAIL e ADMIN_PASSWORD configurados no .env.

As migrações Prisma e os dados iniciais são aplicados na inicialização da API. O seed cria a primeira conta administrativa e planos/modelos usados no ambiente local. Não existe cadastro público.

### Endereços locais

| Serviço | Endereço |
| --- | --- |
| Interface Angular, GraphQL e OIDC | http://localhost:9100 |
| API NestJS direta | http://localhost:9105 |
| PostgreSQL | 127.0.0.1:9101 |
| RabbitMQ | 127.0.0.1:9102 |
| Painel RabbitMQ | http://localhost:9103 |
| MinIO S3 | 127.0.0.1:9104 |
| Painel MinIO | http://localhost:9106 |
| Grafana | http://localhost:9107 |

As portas publicadas pelo Compose ficam limitadas a loopback. As credenciais do Grafana também vêm do arquivo .env.

Para parar os serviços sem apagar os dados persistidos, use docker compose down. O comando docker compose down --volumes remove os volumes locais de banco, fila, arquivos e observabilidade.

## Configuração e segredos

O arquivo .env contém valores locais e é ignorado pelo Git. O arquivo .env.example contém nomes de variáveis, identificadores de exemplo e campos de segredo vazios; não coloque credenciais reais nele.

As variáveis OIDC_ISSUER, OIDC_AUDIENCE e WEB_URL são configuração pública do ambiente, não segredos. Em ambientes externos, configure os domínios HTTPS reais de forma consistente com o proxy e o cliente OIDC. As portas publicadas podem ser substituídas pelas variáveis `*_HOST_PORT` do `.env`; ao trocar a porta web, atualize também `WEB_URL` e `OIDC_ISSUER`. O Compose usa um nome de projeto e imagens próprios deste repositório para manter seus containers e volumes isolados. Consulte [docs/SEGURANCA.md](docs/SEGURANCA.md) antes de expor qualquer serviço fora da máquina local.

## Testes e builds

Os comandos usam dependências travadas nos lockfiles locais. Execute com Node.js 26.13.0 e npm 12.2.2.

~~~~sh
cd godelivery-api-node
npm ci
npm test
npm run build
npm run lint

cd ../godelivery-web-angular
npm ci
npm test
npm run build
~~~~

Para os testes de integração, volte à raiz, mantenha a stack Compose ativa e instale as dependências da raiz:

~~~~sh
cd ..
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:playwright
~~~~

O teste Newman executa operações OIDC, GraphQL e upload/download da CNH e remove os dados temporários que cria. O Playwright cobre o fluxo de login e sessão no navegador. O bitmap de teste em tests/fixtures/CNH.bmp é uma imagem vazia de 2×2 pixels, sem dados pessoais.

A pipeline em [.github/workflows/ci.yml](.github/workflows/ci.yml) executa secret scanning, auditoria de dependências de produção, testes, builds e testes de integração em ambiente efêmero. Ela não publica imagens nem faz deploy e não precisa de segredos de produção.

## Documentação

- [Contrato da API por domínio, operação, rota e verbo](docs/API.md)
- [Revisão de segurança, variáveis e controles operacionais](docs/SEGURANCA.md)
- [Matriz de paridade com a implementação .NET](MATRIZ_PARIDADE.md)

## Observabilidade

O Grafana provisiona o dashboard GoDelivery Node. Prometheus coleta métricas do OpenTelemetry Collector, Tempo recebe traces e Loki recebe logs Pino. Os endpoints /health/live e /health/ready permitem verificar liveness e disponibilidade do banco.

Logs evitam gravar credenciais, tokens, cookies e parâmetros de URL. A chave de assinatura OIDC é gerada na primeira inicialização e persiste no volume dedicado da API.
