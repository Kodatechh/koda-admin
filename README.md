# Koda Admin V2

Painel interno da Koda, com direção visual minimalista e premium.

## Produção

- Vercel: `https://koda-admin-one.vercel.app`

## O que já existe

- Dashboard executivo
- Gestão de dispositivos KodaBot
- Área de KODA OS e rollout
- Pedidos
- Clientes
- Produtos
- KodaCloud
- Suporte
- Auditoria
- Configurações
- Layout responsivo

> Os dados atuais são demonstrativos. A próxima etapa é conectar autenticação e banco de dados reais.

## Estrutura

- `index.html` — shell da aplicação
- `assets/styles.css` — identidade visual e responsividade
- `assets/app.js` — navegação e dados demonstrativos
- `vercel.json` — configuração de deploy e headers básicos de segurança

## Desenvolvimento local

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.
