# Deploy no Azure App Service

Este projeto fica pronto para um primeiro deploy DEV usando um unico App Service Python:

1. Gere o frontend:
   ```bash
   npm ci
   npm run build
   ```

2. Publique o repositorio no App Service incluindo a pasta `dist`.

3. Configure o App Service como Linux/Python 3.11.

4. Configure o startup command:
   ```bash
   bash startup.sh
   ```

   Alternativa direta:
   ```bash
   gunicorn -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 api.main:app
   ```

5. Crie o arquivo de configuracao do ambiente a partir do modelo:
   ```text
   api/config/app_config.example.json
   ```

   O arquivo real esperado pela aplicacao e:
   ```text
   api/config/app_config.json
   ```

   Quando esse arquivo existe, ele e usado automaticamente. Se nao existir, a aplicacao usa `api/config/local_config.json`.

6. Ative Authentication no App Service com Microsoft Entra ID. A API le o usuario pelos headers do Easy Auth.

7. Cadastre as variaveis `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
   `FABRIC_WORKSPACE_ID` e `FABRIC_LAKEHOUSE_ID` nas configuracoes do App Service.

Observacoes:
- O frontend chama `/api` por padrao, entao nao precisa de `VITE_API_BASE_URL` quando front e API estao no mesmo App Service.
- O provider `filesystem` existe apenas para desenvolvimento e e rejeitado em producao.
- Em producao, as cargas usam OneLake e a API de tabelas do Fabric; publicacoes usam a API REST do Power BI.
- Antes do SSO, testes locais podem usar `SANTA_HELENA_LOCAL_AUTH=true`. O bypass aceita apenas
  requisicoes de loopback e nunca deve ser cadastrado no App Service.
- O arquivo `api/config/app_config.json` fica fora do versionamento. Para segredos reais, prefira Key Vault ou referencias seguras do App Service.
