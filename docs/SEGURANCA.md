# Revisão de segurança e configuração

## Escopo e resultado

Revisão estática do checkout antes da primeira publicação pública, em 11/11/2026. Foram verificados arquivos de ambiente, configuração Compose, fontes, documentação, testes e fixtures; também foram examinados o estado do Git e os arquivos binários presentes no projeto.

Na revisão, o repositório ainda não tinha commits ou remoto local. Portanto, não havia histórico Git anterior para auditar. O primeiro commit desta publicação deve conter apenas o estado revisado abaixo.

Não foram encontrados tokens, chaves privadas ou credenciais literais no código-fonte, documentação ou configuração versionada. A varredura local Gitleaks 8.30.1 apontou seis correspondências genéricas, todas restritas ao arquivo .env local; não houve achados fora dele. Esse arquivo está ignorado pelo Git e pelos contextos Docker; seus valores não foram copiados para a documentação nem expostos no relatório. A revisão confirmou que os segredos preenchidos localmente são valores longos e que ADMIN_EMAIL usa um domínio local de exemplo.

.env.example contém somente identificadores de desenvolvimento, endereços locais e valores de segredo vazios. Identificadores de serviço não são tratados como senhas. O bitmap tests/fixtures/CNH.bmp mede 2×2 pixels e está em branco; não contém documento ou dados pessoais.

A auditoria npm --json encontrou 19 avisos nas dependências de teste da raiz: 1 crítico, 12 altos e 6 moderados, incluindo handlebars e dependências transitivas do runner Newman. Essas ferramentas foram classificadas como devDependencies. A API e o Angular não apresentaram avisos em suas árvores auditadas. O registro npm não oferece correção compatível para a versão Newman fixada; a sugestão automática exige downgrade incompatível. A pipeline audita dependências de produção e limita o job de integração a credenciais efêmeras, checkout sem persistência de token e permissões de leitura. Reavalie essa dependência quando o upstream publicar uma correção compatível.

## Dados que exigem proteção

A aplicação processa nome completo, CNPJ, data de nascimento, número e datas da CNH, imagem da CNH, email de conta e metadados de sessão. Eles são dados do domínio, não credenciais do repositório. Não inclua registros reais, exports ou documentos de clientes em issues, fixtures, screenshots ou commits públicos.

O código limita o upload de CNH a PNG/BMP, valida dimensões e tamanho, guarda a chave do objeto no banco e configura o download como private, no-store. Isso não substitui controle de acesso do bucket, TLS, política de retenção, criptografia de backup ou gestão de incidentes no ambiente operacional.

## Variáveis e tratamento por ambiente

| Variável | Uso | Tratamento |
| --- | --- | --- |
| POSTGRES_USER / POSTGRES_PASSWORD | Identidade e senha PostgreSQL | .env local; em produção use usuário dedicado e segredo de cofre |
| RABBITMQ_USER / RABBITMQ_PASSWORD | Acesso à fila | .env local; em produção use conta com permissões restritas à fila necessária |
| S3_ACCESS_KEY / S3_SECRET_KEY | Acesso S3/MinIO | .env local; Compose usa credencial root do MinIO; produção deve usar identidade IAM restrita ao bucket |
| ADMIN_EMAIL | Identificador da conta bootstrap | Configuração, não senha; use email operacional e não publique dados de pessoas |
| ADMIN_PASSWORD | Senha da conta bootstrap | Segredo runtime; mínimo 12 caracteres; nunca coloque no .env.example, README, workflow ou logs |
| OIDC_COOKIE_SECRET | Assinatura dos cookies de interação OIDC | Segredo aleatório de pelo menos 32 caracteres; mantenha estável entre réplicas e protegido em backup |
| GRAFANA_ADMIN_PASSWORD | Senha administrativa local do Grafana | .env local; produção deve usar autenticação e gestão de identidade apropriadas |
| GRAFANA_ADMIN_USER | Usuário do Grafana | Configurável; não é segredo |
| OIDC_ISSUER / OIDC_AUDIENCE / WEB_URL | URLs e identificador do cliente/recurso | Configuração pública; use HTTPS real e valores consistentes com proxy, frontend e tokens |
| S3_BUCKET | Nome do bucket de CNH | Configuração; restrinja o bucket e não o torne público |
| API_ACTIVE_SLOT | Slot blue/green inicial do gateway | Só inicializa a seleção quando o volume `node_gateway_state` está vazio; o comando de deploy persiste as trocas no volume |
| API_MIGRATION_SLOT | Slot cuja imagem executa migrations e seed | Valor inicial `blue`; o script de deploy usa a imagem do slot-alvo |

O arquivo .env e suas variantes são ignorados pelo Git. .env.example fica versionado, mas mantém campos secretos vazios. A pipeline gera valores aleatórios efêmeros para testes de integração; ela não acessa credenciais de produção e não requer secrets do GitHub.

Para produção, forneça os segredos por um secret manager do provedor ou por mecanismos protegidos do runtime. Em GitHub Actions, use Actions Secrets apenas para operações que realmente precisem de segredo; valores não sensíveis ficam em Variables. Não use valores reais de produção no workflow de build.

## Controles presentes no código

- OIDC Authorization Code com PKCE obrigatório, rotação de refresh token e access token de 15 minutos
- Hash de senha com Argon2; o schema de resposta de usuário não inclui hash ou senha
- Redação de Authorization, cookies, referer, Location, senha e imagem base64 nos logs configurados
- Liveness e readiness separados
- Upload de CNH com limite de tamanho e validação de formato/dimensão; download sem cache compartilhado
- Compose publica portas em loopback no host; somente o gateway Nginx expõe HTTP, e as instâncias blue/green da API permanecem na rede interna
- Compose usa projeto, nomes de imagem, rede e volumes próprios; portas do host são configuráveis para coexistir com outras stacks locais
- .env, variantes, chaves privadas e keystores ignorados pelo Git
- Contextos Docker da raiz, API e web excluem .env e variantes antes do build
- CI com secret scanning, permissões mínimas, auditoria das dependências de produção, build e testes sem segredos reais

## Riscos residuais e medidas para implantação

1. O Compose local usa a credencial root do MinIO compartilhada entre storage e API. Em produção, não reutilize esse padrão; crie uma credencial de aplicação com acesso somente ao bucket e às operações necessárias.
2. O limitador de login é uma estrutura em memória por processo. Para múltiplas réplicas, aplique rate limiting distribuído e configure proxy/IP de origem confiável.
3. A API confia em um salto de proxy. Exponha-a por um proxy conhecido, restrinja acesso direto à porta e configure TLS; não confie em cabeçalhos encaminhados de clientes arbitrários.
4. A chave privada OIDC é gerada em /data/oidc-jwks.json com permissão restrita e persiste no volume oidc. Proteja volume e backups; defina procedimento de rotação e recuperação antes de produção.
5. A autenticação atual exige JWT para operações de domínio, mas somente createUser aplica autorização por role admin. As rotas de CNH não verificam vínculo do usuário com o entregador. Defina matriz de papéis e autorização por recurso antes de oferecer consultas, escritas ou documentos pessoais a usuários não confiáveis.
6. A configuração de desenvolvimento usa HTTP e nomes localhost. Não reutilize esses valores em produção; use HTTPS, issuer canônico, CORS restrito e cookies adequados ao domínio.
7. A aplicação armazena dados pessoais e imagens de CNH. Defina base legal, retenção, acesso operacional, auditoria, criptografia em repouso e descarte no ambiente que receber dados reais.

## Resposta a uma exposição

Se uma senha, token, chave ou arquivo .env for publicado por engano, revogue ou rotacione o valor na origem imediatamente. Remover o arquivo em um commit posterior não apaga o segredo do histórico público. Depois da rotação, avalie reescrever o histórico, limpar artefatos e comunicar os responsáveis pelo serviço afetado.
