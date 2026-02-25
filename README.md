# Trick-question-bench

Questions that make the AI go wild! 🤖

An AI benchmark system that tests language models with simple trick questions. The system automatically queries multiple models via OpenRouter, saves their responses, and uses another AI to judge whether the answers are correct.

## Features

- 📝 JSON-based question format with schema validation
- 🤖 Support for multiple AI models via OpenRouter
- ⚖️ Automated answer judging using AI with system prompt
- 🔍 Human review flagging for ambiguous cases
- 🔐 Hash-based answer versioning to track changes
- 💾 Results saved to git-tracked output folder
- 🔧 TypeScript implementation for type safety
- 🚀 GitHub Actions for automated benchmarks and model management

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

### Run the benchmark locally

```bash
npm start
```

`npm start` runs the full benchmark (`npm run start:all`) across all models in `data/models.json`.

To run a smaller benchmark on 5 models:

```bash
npm run start:limited
```

`start:limited` now selects the first 5 models in `data/models.json` that still have pending work (missing answer, error result, or out-of-date hash), then runs only those pending question/model pairs.

This run will:

1. Load questions from `data/questions.json`
2. Load models from `data/models.json`
3. Query each model with each question
4. Save grouped model responses to `output/{company}/{model}.json`
5. Use a judge model to evaluate each answer
6. Flag answers that need human review
7. Generate a summary report with hashes

### Run via GitHub Actions

The benchmark can be run manually through GitHub Actions:

1. Go to the "Actions" tab in your repository
2. Select "Run Benchmark" workflow
3. Click "Run workflow"
4. Results will be automatically committed to the repository

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
├── .github/
│   └── workflows/
│       ├── run-benchmark.yml  # Manually triggered benchmark workflow
│       └── add-model.yml      # Workflow to add new models
├── data/
│   ├── questions.json    # Trick questions to test
│   └── models.json       # Array of model configuration objects
├── schemas/
│   ├── question.schema.json   # JSON schema for questions
│   ├── questions.schema.json  # JSON schema for questions collection
│   └── models.schema.json     # JSON schema for models array
├── src/
│   ├── index.ts          # Main runner
│   ├── api.ts            # OpenRouter API client with judge system prompt
│   ├── loader.ts         # Data loading and validation
│   ├── hash.ts           # Hash generation for answer versioning
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
      "tokenLimit": 50 // Optional max tokens for response
    }
  ]
}
```

## Models Format

Models are defined in `data/models.json` as an array of objects:

```json
[ 
  { "name": "openai/gpt-4o", "disabled": false },
  { "name": "openai/gpt-4o-mini", "disabled": false },
  { "name": "qwen/qwen3-max-thinking", "disabled": false, "thinking": "high" },
  { "name": "anthropic/claude-3.5-sonnet", "disabled": true, "release_date": "2024-06-20" }
]
```

- `name` (required): OpenRouter model identifier.
- `disabled` (required): if `true`, the benchmark skips that model.
- `thinking` (optional): string sent to OpenRouter as reasoning effort.
- `release_date` (optional): `YYYY-MM-DD` release date metadata.

### Adding Models via GitHub Actions

You can add new models automatically:

1. Go to the "Actions" tab
2. Select "Add Model" workflow
3. Click "Run workflow"
4. Enter the model ID
5. A pull request will be created automatically

## Configuration

Environment variables in `.env`:

- `OPENROUTER_API_KEY` - Your OpenRouter API key (required)
- `JUDGE_MODEL` - Model to use for judging (default: `openai/gpt-4o`)

## Judge System Prompt

The judge uses a dedicated system prompt that instructs it to:

- Carefully analyze whether answers are correct
- Determine if the model fell for the trick
- Flag ambiguous answers with `NEEDS_HUMAN_REVIEW`
- Provide confidence levels (LOW, MEDIUM, HIGH)

## Output

Results are saved in the `output/` directory:

- Grouped model results: `{company}/{model}.json`
- Summary report: `summary.json`

Each `{company}/{model}.json` file contains an array of all question/answer results for that model.

Each result includes:

- Question and answer
- Judge's evaluation
- Pass/fail status
- Human review flag
- Hash for version tracking
- Timestamp

The hash changes when:

- The question text changes
- The judge prompt changes
- The judge system prompt changes
- The judge model changes

This allows tracking whether results are comparable across runs.

## License

ISC
