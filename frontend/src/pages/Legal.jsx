import { useEffect } from 'react';

export const LEGAL_PAGES = {
  '/privacidade': 'Política de privacidade',
  '/termos': 'Termos de uso',
  '/cookies': 'Cookies e armazenamento local',
};

export function LegalLinks() {
  return <nav className="legal-links" aria-label="Informações legais">
    {Object.entries(LEGAL_PAGES).map(([path, title]) => <a key={path} href={path}>{title}</a>)}
  </nav>;
}

export default function LegalPage({ path }) {
  const title = LEGAL_PAGES[path];
  useEffect(() => { document.title = `${title} | SusPredict`; }, [title]);
  return <div className="legal-page">
    <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
    <header><a href="/visao-geral">Voltar ao SusPredict</a><LegalLinks /></header>
    <main id="conteudo-principal" tabIndex={-1}>
      <h1>{title}</h1>
      <p>Atualizado em 6 de setembro de 2026 · Projeto acadêmico</p>
      {path === '/privacidade' && <>
        <h2>Finalidade e dados utilizados</h2>
        <p>O SusPredict apoia análises e planejamento em saúde pública com dados agregados do DATASUS e outras fontes identificadas nos painéis. O cadastro solicita nome de identificação, e-mail e senha para criar e proteger sua conta. O serviço de autenticação utiliza Supabase Auth. Perfil de acesso, identificador de usuário e informações de sessão são usados para controlar permissões.</p>
        <h2>Conversas com a Clara</h2>
        <p>Mensagens, respostas e contexto de conversas podem ser armazenados no histórico associado à sua conta. A Clara também possui recursos de memória pessoal. Envie somente informações necessárias à análise: não inclua nomes de pacientes, CPF, prontuários, senhas ou outros dados pessoais sensíveis.</p>
        <p>O processamento de IA depende da configuração do ambiente e pode utilizar modelo local ou serviço externo. Confirme o ambiente com o administrador antes de enviar informações restritas.</p>
        <h2>Integrações e compartilhamento</h2>
        <p>Conectar o Telegram é opcional e exige confirmação no fluxo de pareamento. Ao utilizá-lo, identificadores da conta, mensagens e, quando habilitado, áudios para transcrição passam também pelo Telegram. É possível desconectar o canal no painel da Clara; desconectar não exclui automaticamente o histórico já armazenado.</p>
        <p>Os serviços de hospedagem, autenticação e banco de dados processam informações necessárias à operação. Registros técnicos podem incluir endereço IP, horário e resultado das requisições. O frontend não inclui ferramentas de publicidade ou analytics e entrega fontes e ícones pelo próprio site.</p>
        <h2>Armazenamento e retenção</h2>
        <p>Tokens de sessão e preferências ficam neste navegador, conforme a política de armazenamento. Sair remove os tokens locais, mas não apaga a conta nem as conversas no servidor. Os prazos de retenção de dados e backups devem ser definidos pela organização responsável por cada implantação; esta versão acadêmica não oferece garantia de exclusão automática por prazo.</p>
        <h2>Seus direitos e contato</h2>
        <p>Você pode solicitar informações sobre o tratamento, acesso, correção e, nas hipóteses aplicáveis, exclusão de dados e revogação de consentimento. Procure o administrador que disponibilizou seu acesso para encaminhar a solicitação ao responsável pelo ambiente.</p>
        <p>Esta implantação acadêmica ainda precisa identificar formalmente o controlador, seu canal público de privacidade, as bases legais, os operadores e os prazos de retenção antes de uma abertura institucional ao público.</p>
      </>}
      {path === '/termos' && <>
        <h2>Escopo do serviço</h2>
        <p>O SusPredict é um projeto acadêmico de apoio à análise e ao planejamento em saúde pública. A disponibilidade e a atualização dependem das fontes e dos serviços configurados. Dados observados, demonstrações e informações indisponíveis devem ser interpretados conforme a indicação em cada tela.</p>
        <h2>Uso responsável</h2>
        <p>Use apenas sua própria conta, respeite as permissões concedidas e encerre a sessão em dispositivos compartilhados. Não tente acessar dados de outros usuários, contornar controles ou inserir dados identificáveis de pacientes.</p>
        <h2>Revisão humana</h2>
        <p>Previsões e respostas da Clara podem conter erros. Verifique fontes, período, recorte e limitações antes de decidir. O sistema não substitui avaliação clínica, diagnóstico ou atendimento de emergência. Rascunhos de ETP exigem revisão e aprovação pelos responsáveis e não autorizam compras automaticamente.</p>
        <h2>Fontes e integrações</h2>
        <p>Preserve a indicação de origem e competência ao exportar ou compartilhar resultados. Serviços externos opcionais, como Telegram, têm seus próprios termos e políticas. A conexão pode ser desfeita pelo fluxo disponível na Clara.</p>
        <h2>Privacidade e acesso</h2>
        <p>Consulte a política de privacidade antes de cadastrar ou enviar informações. O acesso institucional depende da liberação do administrador. Estes termos descrevem o uso da versão acadêmica e devem ser revisados pela organização responsável antes da operação pública.</p>
      </>}
      {path === '/cookies' && <>
        <h2>O que este frontend armazena</h2>
        <p>O SusPredict usa localStorage, um armazenamento do navegador diferente de cookies. O código do frontend não cria cookies de publicidade nem carrega rastreadores de analytics. Por isso, esta versão não apresenta um banner de consentimento para essas finalidades.</p>
        <div className="legal-table" tabIndex={0} role="region" aria-label="Inventário de armazenamento"><table><caption>Inventário de armazenamento no navegador</caption><thead><tr><th scope="col">Dados</th><th scope="col">Finalidade</th><th scope="col">Duração</th></tr></thead><tbody>
          <tr><td>sus_predict_token e sus_predict_refresh_token</td><td>Autenticar e renovar a sessão</td><td>Até sair ou limpar os dados do site; a validade é controlada pelo serviço de autenticação</td></tr>
          <tr><td>sus_predict_municipio</td><td>Lembrar o município selecionado</td><td>Até substituir ou limpar os dados do site</td></tr>
          <tr><td>sus_predict_sidebar e sus_predict_beta_variant</td><td>Lembrar a apresentação escolhida</td><td>Até substituir ou limpar os dados do site</td></tr>
        </tbody></table></div>
        <h2>Como controlar</h2>
        <p>Use “Sair” no perfil para encerrar a sessão neste navegador. Para remover também preferências, limpe os dados deste site nas configurações do navegador. Isso não apaga sua conta nem registros no servidor. Consultas também podem permanecer temporariamente em memória durante a sessão, sendo limpas ao sair.</p>
        <h2>Serviços externos e mudanças</h2>
        <p>As fontes são servidas localmente. O Telegram só é utilizado por escolha do usuário. Cookies eventualmente inseridos pela infraestrutura de hospedagem precisam ser inventariados no ambiente publicado. Se forem adicionados analytics, publicidade ou embeds que armazenem dados não necessários, será preciso revisar esta política e implementar o controle adequado antes de carregá-los.</p>
      </>}
    </main>
  </div>;
}
