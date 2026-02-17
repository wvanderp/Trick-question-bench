# Trick-question-bench

Questions that make the AI go wild! 🤖

An AI benchmark system that tests language models with simple trick questions. The system automatically queries multiple models via OpenRouter, saves their responses, and uses another AI to judge whether the answers are correct.

## Features

- 📝 JSON-based question format with schema validation
- 🤖 Support for multiple AI models via OpenRouter
- ⚖️ Automated answer judging using AI
- 💾 Results saved to git-tracked output folder
- 🔧 TypeScript implementation for type safety

## Setup

1. Clone the repository:
```bash
git clone https://github.com/wvanderp/Trick-question-bench.git
cd Trick-question-bench
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
```bash
cp .env.example .env
# Edit .env and add your OpenRouter API key
```

4. Get an OpenRouter API key from [https://openrouter.ai/](https://openrouter.ai/)

## Usage

### Run the benchmark

```bash
npm start
```

This will:
1. Load questions from `data/questions.json`
2. Load models from `data/models.json`
3. Query each model with each question
4. Save individual responses to `output/`
5. Use a judge model to evaluate each answer
6. Generate a summary report

### Build the project

```bash
npm run build
```

### Development mode (with auto-reload)

```bash
npm run dev
```

## File Structure

```
.
├── data/
│   ├── questions.json    # Trick questions to test
│   └── models.json       # List of models to test
├── schemas/
│   ├── question.schema.json   # JSON schema for questions
│   ├── questions.schema.json  # JSON schema for questions collection
│   └── models.schema.json     # JSON schema for models
├── src/
│   ├── index.ts          # Main runner
│   ├── api.ts            # OpenRouter API client
│   ├── loader.ts         # Data loading and validation
│   └── types.ts          # TypeScript type definitions
└── output/               # Test results (git-tracked)
```

## Question Format

Questions are defined in `data/questions.json` with the following structure:

```json
{
  "questions": [
    {
      "id": "unique-id",
      "question": "The actual question to ask the AI",
      "judgePrompt": "Instructions for the judge on how to evaluate the answer",
      "tokenLimit": 50  // Optional max tokens for response
    }
  ]
}
```

## Models Format

Models are defined in `data/models.json`:

```json
{
  "models": [
    {
      "id": "openai/gpt-4o",
      "name": "GPT-4o"
    }
  ]
}
```

Model IDs should match OpenRouter's model identifiers.

## Configuration

Environment variables in `.env`:

- `OPENROUTER_API_KEY` - Your OpenRouter API key (required)
- `JUDGE_MODEL` - Model to use for judging (default: `openai/gpt-4o`)

## Output

Results are saved in the `output/` directory:
- Individual test results: `{model-id}_{question-id}.json`
- Summary report: `summary.json`

## License

ISC 
