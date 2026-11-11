# Matriz de paridade .NET × NestJS

Comparação dos controladores da API .NET atual com os contratos GraphQL/REST da solução paralela. **Implementado** indica existência e validação local do fluxo Node; não implica identidade de formato de resposta nem teste diferencial automatizado com a API .NET. A coleção Postman cobre as linhas marcadas com **E2E**

| Operação | .NET | NestJS | Estado |
| --- | --- | --- | --- |
| Modelos de motocicleta | `GET /api/motorcycle-models?id=&name=` | `motorcycleModels(id, name)` | Implementado, listagem E2E; filtros disponíveis |
| Listar motocicletas | `GET /api/motorcycles?plate=&page=&limit=` | `motorcycles(plate, page, limit)` + `motorcycleCount(plate)` | Filtro, paginação e total E2E |
| Consultar motocicleta | `GET /api/motorcycles/{id}` | `motorcycle(id)` | E2E |
| Criar motocicleta | `POST /api/motorcycles` | `createMotorcycle(input)` | E2E; evento de ano corrente publicado no RabbitMQ |
| Alterar placa | `PUT /api/motorcycles/{id}/plate` | `changeMotorcyclePlate(id, plate)` | E2E |
| Excluir motocicleta | `DELETE /api/motorcycles/{id}` | `deleteMotorcycle(id)` | E2E após devolução; notificações removidas na mesma transação |
| Criar entregador e CNH | `POST /api/deliveriers` | `createDeliverier(input)` | E2E |
| Enviar CNH | `POST /api/license-driver/{id}/upload-cnh` | `POST /api/licenses/{id}/file` | E2E BMP em S3 |
| Baixar CNH | `GET /api/license-driver/{id}/license-File` | `GET /api/licenses/{id}/file` | E2E BMP |
| Consultar locação | `GET /api/rentals/{id}` | `rental(id)` | Implementado |
| Criar locação | `POST /api/rentals` | `createRental(input)` | E2E; índice parcial impede duas locações ativas da mesma moto |
| Devolver locação | `PUT /api/rentals/{id}/return-to-base` | `returnRental(id, returnedToBaseDate)` | E2E para devolução antecipada |
| Planos, entregadores, locações | Sem endpoints de lista nos controladores .NET inspecionados | `rentalPlans`, `deliveriers`, `rentals` | Extensões para interface Angular |
| Autenticação | JWT validado por provedor OAuth/OIDC configurado externamente | OIDC integrado, PKCE, JWT, refresh e gestão de usuários | OIDC e refresh E2E; `createUser` implementado |

## Diferenças e limites observados

- O contrato .NET usa REST e envelopes de resposta `ActionResult`; o Node usa GraphQL, com REST apenas para o arquivo CNH. IDs e bancos são independentes
- A paginação GraphQL expõe itens e total em dois campos, enquanto a API .NET os devolve no mesmo envelope REST
- A API Node gera IDs UUID no banco; os comandos .NET permitem construir um ID informado pelo cliente. Requisições comparativas devem mapear IDs lógicos em vez de comparar valores literais
- O Node normaliza placas e CNPJ e valida categoria, datas e imagem na entrada. Diferenças de mensagens de erro e regras limítrofes ainda precisam de testes diferenciais contra a stack .NET ativa
- A exclusão de motocicleta no Node remove notificações vinculadas e bloqueia locação ativa. A implementação .NET remove notificações vinculadas e aplica seus próprios validadores
- O E2E cobre um plano de 7 dias com devolução no sexto dia. Outros planos e devolução tardia têm testes unitários de cálculo, mas ainda não foram comparados ponta a ponta com .NET
- A coleção valida CNH BMP; PNG é aceito pelo Node e validado no upload, sem cenário E2E específico

Fontes da solução publicada: `godelivery-api-node/src/`, `godelivery-web-angular/src/` e `tests/collection.json`. A aplicação .NET usada para comparação não faz parte deste repositório; a matriz registra apenas os contratos observados no checkout local de referência.
