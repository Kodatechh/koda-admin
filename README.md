# Koda Admin

Painel interno da Koda, com direção visual minimalista e integração real com o KodaCloud.

## Produção

- Vercel: `https://koda-admin-one.vercel.app`
- Repositório: `Kodatechh/koda-admin`

## Dados reais

O Koda Admin usa o projeto Supabase/KodaCloud já existente. A interface não mantém métricas demonstrativas: quando uma área ainda não possui registros, ela mostra um estado vazio.

Áreas conectadas:

- autenticação de administradores e equipe de suporte
- dashboard executivo
- dispositivos KodaBot e telemetria
- versões do KODA OS reportadas pela frota
- pedidos e pagamentos
- clientes / Contas Koda
- catálogo de produtos e estoque
- Chamados de suporte
- auditoria administrativa
- estado da conexão com o KodaCloud

## Chamados

Os chamados usam as tabelas `support_cases` e `support_case_notes`.

No Admin, a equipe pode:

- acompanhar chamados por status
- visualizar o KodaBot relacionado
- ler a mensagem inicial e o histórico
- responder ao cliente
- criar notas internas
- alterar o status do chamado
- registrar as ações no log de auditoria

O banco também já possui políticas para que, no portal do cliente, cada usuário possa acessar apenas seus próprios chamados e as mensagens marcadas como visíveis ao cliente.

A futura **Koda Support AI** deve operar sobre esse mesmo fluxo, sempre tratando o conteúdo enviado pelos clientes como dados não confiáveis e sem fechar chamados automaticamente sem confirmação.

## Segurança

- o navegador usa somente a chave publicável do Supabase
- nenhuma chave `service_role`/secret é enviada ao cliente
- autorização administrativa é baseada em `user_roles` + Row Level Security (RLS)
- textos vindos de clientes são escapados antes de serem inseridos no HTML
- notas internas de chamados não são expostas aos clientes

## Estrutura

- `index.html` — shell, login e estrutura da aplicação
- `assets/styles.css` — identidade visual e responsividade
- `assets/app.js` — autenticação, consultas ao KodaCloud e interações
- `vercel.json` — configuração de deploy e headers básicos de segurança

## Desenvolvimento local

Como `assets/app.js` usa módulos ES, sirva a pasta por HTTP em vez de abrir o HTML diretamente:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.
