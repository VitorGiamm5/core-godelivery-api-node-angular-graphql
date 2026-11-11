import { writeFileSync } from 'node:fs';

const post = (name, query, variables, tests) => ({
  name,
  request: {
    method: 'POST',
    header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{accessToken}}' }],
    url: '{{baseUrl}}/graphql',
    body: { mode: 'raw', raw: JSON.stringify({ query, variables }) },
  },
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
    'pm.test("HTTP 200", () => pm.response.to.have.status(200));',
    'const result = pm.response.json();',
    'pm.test("sem erros GraphQL", () => pm.expect(result.errors, JSON.stringify(result.errors?.map(e => e.message))).to.be.undefined);',
    ...tests,
  ] } }],
});
const get = (name, path, tests, auth = true) => ({ name, request: { method: 'GET', header: auth ? [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }] : [], url: `{{baseUrl}}${path}` }, event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }] });
const items = [
  get('OIDC discovery', '/oidc/.well-known/openid-configuration', [
    'pm.test("discovery responde", () => pm.response.to.have.status(200));',
    'pm.test("issuer correto", () => pm.expect(pm.response.json().issuer).to.equal(pm.environment.get("baseUrl") + "/oidc"));',
  ], false),
  post('Token inválido é rejeitado', 'query { motorcycleModels { id } }', {}, [
    'pm.test("token inválido rejeitado", () => pm.expect(result.errors?.[0]?.message).to.match(/Invalid access token/));',
  ]).valueOf(),
  post('Modelos', 'query { motorcycleModels { id name } }', {}, [
    'pm.test("modelos disponíveis", () => pm.expect(result.data.motorcycleModels.length).to.be.greaterThan(0));',
    'pm.environment.set("modelName", result.data.motorcycleModels[0].name);',
  ]),
  post('Planos', 'query { rentalPlans { id days dailyCost } }', {}, [
    'const plan = result.data.rentalPlans.find(p => p.days === 7);',
    'pm.test("plano de sete dias disponível", () => pm.expect(plan).to.exist);',
    'pm.environment.set("planId", plan.id);',
  ]),
  post('Criar motocicleta', 'mutation($input: CreateMotorcycleInput!) { createMotorcycle(input: $input) { id plate yearManufacture } }', { input: { plate: '{{plate}}', yearManufacture: Number(new Date().getFullYear()), modelName: '{{modelName}}' } }, [
    'pm.test("placa normalizada", () => pm.expect(result.data.createMotorcycle.plate).to.equal(pm.environment.get("plate")));',
    'pm.environment.set("motorcycleId", result.data.createMotorcycle.id);',
  ]),
  post('Consultar motocicleta', 'query($id: String!) { motorcycle(id: $id) { id plate } }', { id: '{{motorcycleId}}' }, [
    'pm.test("motocicleta encontrada", () => pm.expect(result.data.motorcycle.id).to.equal(pm.environment.get("motorcycleId")));',
  ]),
  post('Alterar placa', 'mutation($id: String!, $plate: String!) { changeMotorcyclePlate(id: $id, plate: $plate) { id plate } }', { id: '{{motorcycleId}}', plate: '{{plateChanged}}' }, [
    'pm.test("nova placa persistida", () => pm.expect(result.data.changeMotorcyclePlate.plate).to.equal(pm.environment.get("plateChanged")));',
  ]),
  post('Filtrar motocicletas por placa', 'query($plate: String!) { motorcycles(plate: $plate, page: 1, limit: 1) { id plate } motorcycleCount(plate: $plate) }', { plate: '{{plateChanged}}' }, [
    'pm.test("filtro encontra motocicleta", () => pm.expect(result.data.motorcycles.some(m => m.id === pm.environment.get("motorcycleId"))).to.be.true);',
    'pm.test("paginação informa total", () => pm.expect(result.data.motorcycleCount).to.equal(1));',
  ]),
  post('Criar entregador', 'mutation($input: CreateDeliverierInput!) { createDeliverier(input: $input) { id cnpj licenseNumber } }', { input: { fullName: 'Postman Tester', cnpj: '{{cnpj}}', birthDate: '2000-01-01T00:00:00.000Z', licenseNumber: '{{licenseNumber}}', licenseType: 'AB', issueDate: '2020-01-01T00:00:00.000Z', expiryDate: '2030-01-01T00:00:00.000Z' } }, [
    'pm.test("CNPJ preservado", () => pm.expect(result.data.createDeliverier.cnpj).to.equal(pm.environment.get("cnpj")));',
    'pm.environment.set("deliverierId", result.data.createDeliverier.id);',
  ]),
  { name: 'Enviar CNH', request: { method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{accessToken}}' }], url: '{{baseUrl}}/api/licenses/{{licenseNumber}}/file', body: { mode: 'raw', raw: '{"licenseImageBase64":"{{licenseBase64}}"}' } }, event: [{ listen: 'test', script: { exec: [
    'pm.test("upload aceito", () => pm.response.to.have.status(201));',
    'pm.test("metadados da CNH", () => pm.expect(pm.response.json().metadata.id).to.equal(pm.environment.get("licenseNumber")));',
  ] } }] },
  get('Baixar CNH', '/api/licenses/{{licenseNumber}}/file', [
    'pm.test("arquivo disponível", () => pm.response.to.have.status(200));',
    'pm.test("tipo BMP", () => pm.expect(pm.response.headers.get("Content-Type")).to.include("image/bmp"));',
  ]),
  post('Criar locação', 'mutation($input: CreateRentalInput!) { createRental(input: $input) { id motorcycleId planId } }', { input: { deliverierId: '{{deliverierId}}', motorcycleId: '{{motorcycleId}}', planId: '{{planId}}', startDate: '{{startDate}}' } }, [
    'pm.test("locação associada à motocicleta", () => pm.expect(result.data.createRental.motorcycleId).to.equal(pm.environment.get("motorcycleId")));',
    'pm.environment.set("rentalId", result.data.createRental.id);',
  ]),
  post('Devolver locação', 'mutation($id: String!, $date: DateTime!) { returnRental(id: $id, returnedToBaseDate: $date) { value chargeableDays rentalAmount totalCharge } }', { id: '{{rentalId}}', date: '{{returnDate}}' }, [
    'pm.test("multa do plano de sete dias", () => pm.expect(result.data.returnRental.value).to.equal(20));',
    'pm.test("seis dias cobrados", () => pm.expect(result.data.returnRental.chargeableDays).to.equal(6));',
  ]),
  post('Excluir motocicleta devolvida', 'mutation($id: String!) { deleteMotorcycle(id: $id) }', { id: '{{motorcycleId}}' }, [
    'pm.test("motocicleta excluída", () => pm.expect(result.data.deleteMotorcycle).to.be.true);',
  ]),
];
// This request expects an error and uses a deliberately bad token.
items[1].request.header[1].value = 'Bearer invalid-token';
items[1].event[0].script.exec = items[1].event[0].script.exec.filter(line => !line.includes('sem erros GraphQL'));
const collection = { info: { name: 'GoDelivery Node E2E', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: items };
writeFileSync(new URL('./collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');
