import { GoogleGenerativeAI } from '@google/generative-ai';

// Verificar se a API key está disponível
const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
console.log('API Key disponível:', !!apiKey);
console.log('API Key length:', apiKey ? apiKey.length : 0);

if (!apiKey) {
  console.error('❌ API Key não encontrada! Verifique o arquivo .env');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

export interface AITaskRequest {
  userInput: string;
  currentDate: Date;
}

export interface AITaskResponse {
  tasks: Array<{
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'backlog' | 'to-do' | 'in-progress' | 'done';
    taskType: 'geral' | 'recorrente' | 'compromisso';
    dueDate?: string;
    startDate?: string;
    recurringDays?: string[];
    recurringTime?: string;
    appointmentTime?: string;
    blockType: string;
  }>;
  suggestedBlock?: string;
}

export const createTasksFromAI = async (request: AITaskRequest): Promise<AITaskResponse> => {
  try {
    // Verificar se a API key está configurada
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    console.log('🔑 Verificando API Key...');
    console.log('API Key presente:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      console.error('❌ API Key não configurada!');
      console.error('Verifique se o arquivo .env existe e contém: REACT_APP_GEMINI_API_KEY=sua_chave_aqui');
      throw new Error('API key não configurada. Verifique o arquivo .env');
    }

    console.log('✅ API Key configurada, iniciando chamada para Gemini API...');
    
    // Teste simples primeiro
    if (request.userInput.includes('teste')) {
      console.log('Executando teste simples...');
      return {
        tasks: [{
          title: 'Tarefa de Teste',
          description: 'Esta é uma tarefa de teste criada pela IA',
          priority: 'medium',
          status: 'to-do',
          taskType: 'geral',
          blockType: 'teste'
        }],
        suggestedBlock: 'teste'
      };
    }
    
    const prompt = 
`
Você é um assistente de produtividade especializado em criar tarefas organizadas chamado tide.
Analise a entrada do usuário e crie tarefas apropriadas.

Data atual: ${request.currentDate.toLocaleDateString('pt-BR')}

Entrada do usuário: "${request.userInput}"

se o usuario pedir "tide" vc deve interpretar o que foi pedido e realizar a ação.
Se o usuario citar uma task parecida com uma existente, pergunte se ele ta se referindo a ela ou a uma nova? y/n

kanban: 
O padrão vai ser pra colocar em backlog
Se eu pedir com verbos no infinitivo, coloca em to do.
Se tiver no gerundio = in progress
Terminei = done

entao se eu falar terminei "alguma task" tem que marcar ela como done, ou caso ela nao exista ainda colocar ela como done direto

o padrao das prioridades é ser low, so muda se eu pedir.
tipos:
   - Tarefa única → "geral"
   - Compromisso com data/hora → "compromisso"
   - Tarefa que se repete → "recorrente"

  tasks recorrentes: a task tem dia de inicio e de fim, nesse caso o fim pode ser indefinido, mas caso informado, a recorrencia deve ser somente durante aquele periodo, e a tarefa aparece no gantt.

**Datas e prazos:**
   - "até sexta" → dueDate calculado
   - "dia 05/09 14h" → startDate e appointmentTime (compromisso único)
   - "amanhã 15h" → startDate e appointmentTime (compromisso único)
   - "toda terça 12h" → recurringDays e recurringTime (recorrente)
   - "consulta médica dia 15 às 10h" → startDate e appointmentTime (compromisso único)

**Prioridades:**
   - "urgente" → "high"
   - "importante" → "medium"
   - Padrão → "low"

**Blocos/Projetos:**
   - Só sugira um bloco se o usuário explicitamente pedir um novo
   - Se não especificar, deixe suggestedBlock vazio (as tarefas vão para "Compromissos")
   - Use blocos existentes quando possível
   - **COMANDO ESPECIAL "schedule"**: Se o usuário começar com "schedule", crie um bloco com o nome da matéria/disciplina e adicione a tarefa APENAS no schedule (não no kanban)

Responda apenas com JSON válido no formato:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "priority": "low|medium|high",
      "status": "backlog|to-do|in-progress|done",
      "taskType": "geral|recorrente|compromisso",
      "dueDate": "YYYY-MM-DD",
      "startDate": "YYYY-MM-DD",
      "recurringDays": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      "recurringTime": "HH:MM",
      "appointmentTime": "HH:MM",
      "blockType": "string"
    }
  ],
  "suggestedBlock": "string"
}
  o default de uma description é nao ter nada, so se for informada.
  obs: a task pode ser recorrente mas ter data de inicio e fim, isso deve ser perguntado para que seja feita da melhor forma. se tiver data prevista pra fim, colocar no gantt, se nao, nao colocar.
  ex: task: avaliar a escola toda quarta as 14h desde 13/08 ate 17/09
  significa que do dia 13 ao 17 todas as quartas as 14h vai ter a task x

Exemplos de entrada:
- "preciso fazer relatório até sexta" → tarefa geral com prazo, status to-do (vai para "Compromissos")
- "estou fazendo análise de dados" → tarefa em progresso (vai para "Compromissos")
- "terminei revisão do código" → tarefa concluída (vai para "Compromissos")
- "consulta dentista amanhã 15h" → compromisso com data/hora (vai para "Compromissos")
- "gastroenterologista dia 05/09 14:20" → compromisso com data/hora (vai para "Compromissos")
- "exercícios toda terça 12h" → tarefa recorrente (vai APENAS para agenda, NÃO para kanban nem gantt)
- "backlog estudar React" → tarefa no backlog (vai para "Compromissos")
- "criar projeto 'Marketing Digital'" → tarefa + bloco novo "Marketing Digital"
- "no projeto 'Trabalho' preciso fazer relatório" → tarefa no bloco existente "Trabalho"

**EXEMPLOS COM COMANDO "schedule":**
- "schedule redes de computadores toda segunda 8 às 12" → bloco "Redes de Computadores" + tarefa recorrente APENAS no schedule
- "schedule matemática toda terça 14h" → bloco "Matemática" + tarefa recorrente APENAS no schedule
- "schedule física toda quarta 10 às 12" → bloco "Física" + tarefa recorrente APENAS no schedule

**IMPORTANTE:**
- Compromissos únicos com data/hora específica = "compromisso" (NÃO recorrente)
- Tarefas que se repetem = "recorrente" (com recurringDays)
- Use "compromisso" para consultas médicas, reuniões, eventos únicos
- Use "recorrente" apenas quando houver palavras como "toda", "todos os", "semanalmente"

**REGRAS DE CLASSIFICAÇÃO:**
- "gastroenterologista dia 05/09 14:20" → taskType: "compromisso" (NÃO recorrente)
- "consulta médica amanhã 15h" → taskType: "compromisso" (NÃO recorrente)
- "reunião dia 20 às 10h" → taskType: "compromisso" (NÃO recorrente)
- "exercícios toda terça 12h" → taskType: "recorrente" (com recurringDays)
- "aula de piano toda quarta 16h" → taskType: "recorrente" (com recurringDays)

**COMPROMISSOS ÚNICOS SEMPRE = "compromisso"**
**RECORRÊNCIAS SEMPRE = "recorrente"**

**INSTRUÇÕES PARA COMANDO "schedule":**
- Se o usuário começar com "schedule", extraia o nome da matéria/disciplina
- Crie um bloco com o nome da matéria (capitalize a primeira letra de cada palavra)
- A tarefa deve ser sempre "recorrente" (taskType: "recorrente")
- A tarefa deve ir APENAS para o schedule (não para kanban nem gantt)
- Use o nome da matéria como título da tarefa
- Exemplo: "schedule redes de computadores toda segunda 8 às 12" → bloco: "Redes De Computadores", tarefa: "Redes de computadores"
`;


    console.log('Prompt criado, chamando Gemini API...');
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log('Modelo carregado, gerando conteúdo...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('Resposta recebida:', text);
    
    if (!text) throw new Error('Resposta vazia da IA');

    // Limpar a resposta para extrair apenas o JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Formato de resposta inválido. Texto recebido:', text);
      throw new Error('Formato de resposta inválido da IA');
    }
    
    const parsedResponse = JSON.parse(jsonMatch[0]);
    console.log('Resposta parseada:', parsedResponse);
    
    return parsedResponse;
  } catch (error) {
    console.error('Erro detalhado ao criar tarefas com IA:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('Erro de configuração da API: ' + error.message);
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('Erro de conexão: ' + error.message);
      } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
        throw new Error('Limite de requisições excedido: ' + error.message);
      } else if (error.message.includes('JSON')) {
        throw new Error('Erro ao processar resposta da IA: ' + error.message);
      }
    }
    
    throw new Error('Erro inesperado: ' + (error instanceof Error ? error.message : String(error)));
  }
};
