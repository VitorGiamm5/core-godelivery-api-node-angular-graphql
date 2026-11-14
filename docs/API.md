# Contrato da API GoDelivery

Este documento descreve as operações expostas pelo código NestJS atual. O endpoint GraphQL é a interface funcional principal; health, logout, interação OIDC e arquivos de CNH usam HTTP.

## Ambientes e autenticação

No Compose local, o gateway publica a aplicação e a API em http://localhost:9100. GraphQL, OIDC, health checks e arquivos de CNH são encaminhados ao slot ativo (`api-blue` ou `api-green`); as instâncias da API não publicam portas diretamente no host. O endpoint GraphQL é POST /graphql.

As operações GraphQL dos domínios Identity, Motorcycles, Deliveriers e Rentals exigem um access token JWT:

~~~~http
Authorization: Bearer <access_token>
Content-Type: application/json
~~~~

O token é obtido pelo fluxo OIDC Authorization Code com PKCE. Não envie senha em operações GraphQL, exceto na mutação administrativa de criação de conta; a senha é armazenada como hash Argon2 e nunca faz parte do objeto User retornado.

Para evitar dependência de caminhos presumidos pelo cliente, consulte GET /oidc/.well-known/openid-configuration. Os campos authorization_endpoint, token_endpoint, jwks_uri e end_session_endpoint publicados pelo provedor são a referência para o respectivo ambiente.

## GraphQL

Todas as operações abaixo usam POST /graphql e um corpo JSON com query e, quando aplicável, variables. Os nomes e tipos refletem o schema code-first dos módulos. Em produção, a introspecção está desativada.

### Identity

O resolver exige JWT para as duas operações. createUser exige também que o usuário autenticado tenha role admin.

| Operação GraphQL | Tipo | Argumentos | Retorno |
| --- | --- | --- | --- |
| me | Query | nenhum | User |
| createUser | Mutation | email: String!, name: String!, password: String! | User |

User contém id, email, name e role. A senha deve ter ao menos 12 caracteres. Não há endpoint de auto cadastro.

Exemplo:

~~~~graphql
query CurrentUser {
  me {
    id
    email
    name
    role
  }
}
~~~~

### Motorcycles

Todas as operações exigem JWT.

| Operação GraphQL | Tipo | Argumentos | Retorno |
| --- | --- | --- | --- |
| motorcycleModels | Query | id: String opcional; name: String opcional | [MotorcycleModel] |
| motorcycles | Query | plate: String opcional; page: Int opcional (padrão 1); limit: Int opcional (padrão 100) | [Motorcycle] |
| motorcycleCount | Query | plate: String opcional | Int |
| motorcycle | Query | id: String! | Motorcycle |
| createMotorcycle | Mutation | input: CreateMotorcycleInput! | Motorcycle |
| changeMotorcyclePlate | Mutation | id: String!, plate: String! | Motorcycle |
| deleteMotorcycle | Mutation | id: String! | Boolean |

CreateMotorcycleInput contém plate, yearManufacture e modelName. Motorcycle retorna id, plate, yearManufacture e modelName. MotorcycleModel retorna id e name.

A placa é normalizada para letras maiúsculas e validada nos formatos antigo ou Mercosul. A paginação aceita page a partir de 1 e limit entre 1 e 100. O ano precisa ser posterior a 1903 e não pode exceder o próximo ano. O modelo deve existir no seed ou no banco. Uma motocicleta com locação ativa não pode ser removida. Ao criar uma motocicleta do ano corrente, a API publica uma notificação durável no RabbitMQ.

### Deliveriers

Todas as operações exigem JWT. Os campos fullName, cnpj, birthDate e informações de CNH identificam pessoas e devem ser tratados como dados pessoais.

| Operação GraphQL | Tipo | Argumentos | Retorno |
| --- | --- | --- | --- |
| deliveriers | Query | nenhum | [Deliverier] |
| deliverier | Query | id: String! | Deliverier |
| createDeliverier | Mutation | input: CreateDeliverierInput! | Deliverier |

CreateDeliverierInput contém fullName, cnpj, birthDate, licenseNumber, licenseType, issueDate e expiryDate. Deliverier retorna id, fullName, cnpj, birthDate, licenseNumber, licenseType e hasLicenseFile.

As validações exigem nome com pelo menos três caracteres, CNPJ válido, idade mínima de 18 anos, categoria de CNH A ou AB, número da CNH com 11 dígitos, emissão não futura e vencimento posterior à data atual e à emissão. A consulta de lista retorna até 100 registros mais recentes.

### Rentals

Todas as operações exigem JWT.

| Operação GraphQL | Tipo | Argumentos | Retorno |
| --- | --- | --- | --- |
| rentalPlans | Query | nenhum | [RentalPlan] |
| rentals | Query | nenhum | [Rental] |
| rental | Query | id: String! | Rental |
| createRental | Mutation | input: CreateRentalInput! | Rental |
| returnRental | Mutation | id: String!, returnedToBaseDate: DateTime! | RentalReturn |

CreateRentalInput contém deliverierId, motorcycleId, planId e startDate opcional. Rental contém id, deliverierId, motorcycleId, planId, startDate, endDate, estimatedReturnDate e returnedToBaseDate.

A criação exige plano, entregador e motocicleta existentes, duração do plano positiva e motocicleta sem locação ativa. Sem startDate, a API usa a data atual. returnRental exige uma locação ainda aberta e uma data posterior ao início. RentalReturn apresenta message, value, chargeableDays, rentalAmount e totalCharge.

### Erros GraphQL

O servidor pode retornar HTTP 200 com data, errors ou ambos, conforme o comportamento do protocolo GraphQL. Clientes devem verificar errors e não depender apenas do status HTTP para determinar o resultado do domínio.

As classes de erro incluem não autenticado, acesso administrativo negado, entidade inexistente e violação de regra de negócio. Os códigos GraphQL seguem a conversão Nest/Apollo do ambiente; não trate mensagens internas como contrato estável.

## Endpoints HTTP

### Health

| Verbo e rota | Autenticação | Comportamento |
| --- | --- | --- |
| GET /health/live | pública | Confirma que o processo está ativo e retorna status ok. Não consulta o banco. |
| GET /health/ready | pública | Executa SELECT 1 no PostgreSQL e retorna status ok quando a API pode atender. |

### Logout da API

| Verbo e rota | Autenticação | Corpo | Resposta |
| --- | --- | --- | --- |
| POST /api/auth/logout | Bearer JWT | nenhum | JSON com message Session revoked |

A rota salva o jti do access token na tabela de revogação até sua expiração e remove registros expirados. Retorna erro se o token não tiver jti ou exp.

### Arquivos da CNH

| Verbo e rota | Autenticação | Corpo ou resposta |
| --- | --- | --- |
| POST /api/licenses/:id/file | Bearer JWT | JSON com licenseImageBase64 em base64; aceita PNG e BMP validados |
| GET /api/licenses/:id/file | Bearer JWT | Bytes da imagem com o tipo de conteúdo registrado |

O upload exige uma CNH cadastrada, arquivo entre 10 bytes e 10 MB, dimensões máximas de 10.000 por lado e 12 milhões de pixels. Há também um limite global de 2 MiB no parser JSON da API; como a imagem é enviada em base64, esse limite global restringe o tamanho prático do arquivo a aproximadamente 1,5 MiB. O arquivo é guardado no bucket S3 configurado e a resposta contém metadata com id, objectKey e contentType.

O download retorna Cache-Control: private, no-store. Uma licença inexistente ou sem imagem retorna não encontrado. O endpoint não recebe caminho de arquivo; o objectKey vem do registro persistido. O guard exige uma identidade autenticada, mas não confere vínculo entre usuário e entregador/licença; não exponha registros pessoais a operadores não confiáveis sem autorização por recurso.

Exemplo de upload:

~~~~http
POST /api/licenses/<license-id>/file
Authorization: Bearer <access_token>
Content-Type: application/json

{"licenseImageBase64":"<base64-da-imagem>"}
~~~~

## Protocolo OIDC e interação

O provedor é montado sob /oidc. Consulte a descoberta para confirmar caminhos e capacidades de cada ambiente; a lista abaixo corresponde ao provedor e às opções habilitadas neste código.

| Verbo e rota | Finalidade |
| --- | --- |
| GET /oidc/.well-known/openid-configuration | Descoberta OpenID Connect |
| GET /oidc/.well-known/oauth-authorization-server | Metadados OAuth 2.0 |
| GET /oidc/auth | Solicitação de autorização; o navegador segue redirecionamentos para a interação |
| GET /oidc/auth/:uid | Continuação de autorização após a interação |
| POST /oidc/token | Troca de authorization code ou rotação de refresh token |
| GET /oidc/jwks | Chaves públicas para validar tokens |
| GET ou POST /oidc/me | UserInfo protegido por access token |
| POST /oidc/token/revocation | Revogação de token |
| POST /oidc/request | Pushed Authorization Request (PAR) |
| GET /oidc/session/end | Início do encerramento de sessão OIDC |
| POST /oidc/session/end/confirm | Confirmação do encerramento de sessão |
| GET /oidc/session/end/success | Retorno após encerramento concluído |

O cliente Angular usa Authorization Code, PKCE obrigatório, access token de 15 minutos e refresh token rotativo. A aplicação também implementa logout da API em POST /api/auth/logout; esse endpoint grava o jti do access token na lista de revogação local, enquanto /oidc/session/end encerra a sessão no provedor.

As páginas de interação são rotas HTTP definidas pela aplicação:

| Verbo e rota | Conteúdo | Observações |
| --- | --- | --- |
| GET /interaction/:uid | HTML de login ou consentimento | Cache-Control no-store e política CSP restritiva |
| POST /interaction/:uid/login | Formulário urlencoded: email, password, csrf | Exige prompt de login válido e CSRF correspondente |
| POST /interaction/:uid/confirm | Formulário urlencoded: csrf | Exige consentimento pendente e CSRF correspondente |

O login limita tentativas a 10 por conta e 50 por endereço IP em uma janela de um minuto. O controle reside na memória do processo e reinicia com a API; em múltiplas réplicas, use limitação compartilhada antes da exposição externa.

## Notificações e persistência

Notifications não publica uma rota HTTP ou operação GraphQL. Criar uma motocicleta do ano corrente envia uma mensagem durável à fila godelivery-node-motorcycle-notification. O consumidor persiste o evento na tabela Notification.

Database também é infraestrutura interna: PostgreSQL e Prisma persistem contas, registros OIDC, revogações, motocicletas, entregadores, CNH, locações e notificações.
