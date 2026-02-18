import { useEffect, useMemo, useState } from 'react';
import type { BenchResult, GeneratedData } from './types';

const pct = (value: number) => `${value.toFixed(1)}%`;

const toDisplayTime = (value: string) => {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

function App() {
  const [data, setData] = useState<GeneratedData | null>(null);
  const [error, setError] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedQuestion, setSelectedQuestion] = useState<string>('all');
  const [selectedVerdict, setSelectedVerdict] = useState<'all' | 'pass' | 'fail'>('all');
  const [search, setSearch] = useState('');
  const [selectedResultId, setSelectedResultId] = useState<string>('');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}generated/benchmark-data.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load data (${response.status})`);
        }
        return response.json() as Promise<GeneratedData>;
      })
      .then((payload) => {
        setData(payload);
        if (payload.results.length > 0) {
          setSelectedResultId(payload.results[0].id);
        }
      })
      .catch((fetchError: unknown) => {
        const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        setError(message);
      });
  }, []);

  const filteredResults = useMemo(() => {
    if (!data) {
      return [];
    }

    const searchLower = search.trim().toLowerCase();

    return data.results.filter((item) => {
      if (selectedModel !== 'all' && item.modelId !== selectedModel) {
        return false;
      }
      if (selectedQuestion !== 'all' && item.questionId !== selectedQuestion) {
        return false;
      }
      if (selectedVerdict === 'pass' && !item.passed) {
        return false;
      }
      if (selectedVerdict === 'fail' && item.passed) {
        return false;
      }
      if (!searchLower) {
        return true;
      }

      return (
        item.question.toLowerCase().includes(searchLower) ||
        item.answer.toLowerCase().includes(searchLower) ||
        (item.reasoning?.toLowerCase().includes(searchLower) ?? false) ||
        item.judgment.toLowerCase().includes(searchLower) ||
        item.modelName.toLowerCase().includes(searchLower)
      );
    });
  }, [data, search, selectedModel, selectedQuestion, selectedVerdict]);

  const selectedResult: BenchResult | undefined = useMemo(() => {
    if (filteredResults.length === 0) {
      return undefined;
    }

    const found = filteredResults.find((item) => item.id === selectedResultId);
    return found ?? filteredResults[0];
  }, [filteredResults, selectedResultId]);

  const rankedModels = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.models.slice().sort((a, b) => {
      if (b.passRate !== a.passRate) {
        return b.passRate - a.passRate;
      }
      return b.total - a.total;
    });
  }, [data]);

  const topThreeModels = rankedModels.slice(0, 3);

  const worstThreeModels = useMemo(() => {
    const sortedAscending = rankedModels.slice().sort((a, b) => {
      if (a.passRate !== b.passRate) {
        return a.passRate - b.passRate;
      }
      return b.total - a.total;
    });

    return sortedAscending.filter((model) => !topThreeModels.some((topModel) => topModel.id === model.id)).slice(0, 3);
  }, [rankedModels, topThreeModels]);

  const topBadges = ['👑 1', '👑 2', '👑 3'];
  const bottomBadges = ['⬇ 1', '⬇ 2', '⬇ 3'];

  if (error) {
    return <div className="container">Failed to load benchmark data: {error}</div>;
  }

  if (!data) {
    return <div className="container">Loading benchmark data…</div>;
  }

  const hasActiveFilters =
    selectedModel !== 'all' || selectedQuestion !== 'all' || selectedVerdict !== 'all' || search.trim() !== '';

  const clearFilters = () => {
    setSelectedModel('all');
    setSelectedQuestion('all');
    setSelectedVerdict('all');
    setSearch('');
  };

  return (
    <div className="container">
      <header>
        <h1>Trick Question Bench</h1>
        <p>Browse prompts, model answers, and judge verdict explanations from precomputed benchmark stats.</p>
        <span className="header-meta">Generated {toDisplayTime(data.generatedAt)}</span>
      </header>

      <section className="stat-grid">
        <article className="stat-card">
          <h3>Results</h3>
          <p>{data.totals.results}</p>
        </article>
        <article className="stat-card">
          <h3>Models</h3>
          <p>{data.totals.models}</p>
        </article>
        <article className="stat-card">
          <h3>Pass rate</h3>
          <p className="accent-pass">{pct(data.totals.passRate)}</p>
        </article>
        <article className="stat-card">
          <h3>Passed</h3>
          <p>{data.totals.passed}</p>
        </article>
        <article className="stat-card">
          <h3>Failed</h3>
          <p>{data.totals.failed}</p>
        </article>
        <article className="stat-card">
          <h3>Needs review</h3>
          <p>{data.totals.needsHumanReview}</p>
        </article>
      </section>

      <section className="chart-grid">
        <article className="panel">
          <h2>Model leaderboard</h2>
          <div className="leaderboard-grid">
            <div>
              <h3>Top 3</h3>
              <ul className="leaderboard-list">
                {topThreeModels.map((model, index) => (
                  <li key={model.id} className="leaderboard-item">
                    <button
                      type="button"
                      className={`leaderboard-button top ${selectedModel === model.id ? 'active' : ''}`}
                      onClick={() => setSelectedModel(model.id)}
                    >
                      <span className="badge">{topBadges[index]}</span>
                      <span className="leaderboard-model">{model.label}</span>
                      <span>{pct(model.passRate)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3>Worst 3</h3>
              <ul className="leaderboard-list">
                {worstThreeModels.map((model, index) => (
                  <li key={model.id} className="leaderboard-item">
                    <button
                      type="button"
                      className={`leaderboard-button bottom ${selectedModel === model.id ? 'active' : ''}`}
                      onClick={() => setSelectedModel(model.id)}
                    >
                      <span className="badge">{bottomBadges[index]}</span>
                      <span className="leaderboard-model">{model.label}</span>
                      <span>{pct(model.passRate)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="leaderboard-note">Tip: click a model to instantly filter results.</p>
        </article>

        <article className="panel">
          <h2>Pass rate by provider</h2>
          <div className="bar-list">
            {data.providers
              .slice()
              .sort((a, b) => b.passRate - a.passRate)
              .map((provider) => (
                <div className="bar-row" key={provider.id}>
                  <span>{provider.label}</span>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${provider.passRate}%` }} />
                  </div>
                  <span>{pct(provider.passRate)}</span>
                </div>
              ))}
          </div>
        </article>

        <article className="panel">
          <h2>Most failed prompts</h2>
          <div className="bar-list">
            {(() => {
              const sorted = data.questions.slice().sort((a, b) => b.failed - a.failed).slice(0, 8);
              const maxFailed = sorted[0]?.failed || 1;
              return sorted.map((question) => (
                <button
                  type="button"
                  className={`bar-row bar-row-interactive ${selectedQuestion === question.id ? 'active' : ''}`}
                  key={question.id}
                  onClick={() => setSelectedQuestion(selectedQuestion === question.id ? 'all' : question.id)}
                >
                  <span className="truncate">{question.id}</span>
                  <div className="bar-bg">
                    <div
                      className="bar-fill danger"
                      style={{ width: `${(question.failed / maxFailed) * 100}%` }}
                    />
                  </div>
                  <span>{question.failed}</span>
                </button>
              ));
            })()}
          </div>
        </article>
      </section>

      <section className="panel filters">
        <div className="filters-header">
          <h2>Filter results</h2>
          {hasActiveFilters && (
            <button type="button" className="filters-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        <div className="filters-row">
          <label>
            Model
            <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
              <option value="all">All models</option>
              {data.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Prompt
            <select value={selectedQuestion} onChange={(event) => setSelectedQuestion(event.target.value)}>
              <option value="all">All prompts</option>
              {data.questions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            Verdict
            <select
              value={selectedVerdict}
              onChange={(event) => setSelectedVerdict(event.target.value as 'all' | 'pass' | 'fail')}
            >
              <option value="all">All</option>
              <option value="pass">PASS</option>
              <option value="fail">FAIL</option>
            </select>
          </label>

          <label>
            Search
            <input
              type="text"
              value={search}
              placeholder="Search question, answer, judgment, model"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="results-layout">
        <article className="panel result-list">
          <h2>Results ({filteredResults.length}{hasActiveFilters ? ` of ${data.results.length}` : ''})</h2>
          <ul>
            {filteredResults.map((item) => (
              <li key={item.id}>
                <button
                  className={selectedResult?.id === item.id ? 'active' : ''}
                  onClick={() => setSelectedResultId(item.id)}
                  type="button"
                >
                  <div className="result-item">
                    <span className={`verdict-badge ${item.passed ? 'pass' : 'fail'}`}>
                      {item.passed ? 'Pass' : 'Fail'}
                    </span>
                    <div className="result-item-meta">
                      <div className="result-item-value truncate">{item.modelName}</div>
                      <div className="result-item-value truncate">{item.questionId}</div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel result-detail">
          <div className="result-detail-heading">
            <h2>Result detail</h2>
            {selectedResult && (
              <>
                <span className={`verdict-badge ${selectedResult.passed ? 'pass' : 'fail'}`}>
                  {selectedResult.passed ? 'Pass' : 'Fail'}
                </span>
                {selectedResult.needsHumanReview && (
                  <span className="verdict-badge review">Needs review</span>
                )}
              </>
            )}
          </div>
          {selectedResult ? (
            <>
              <dl className="result-meta-grid">
                <dt className="result-meta-label">Model</dt>
                <dd className="result-meta-value">{selectedResult.modelName}</dd>
                <dt className="result-meta-label">Provider</dt>
                <dd className="result-meta-value">{selectedResult.provider}</dd>
                <dt className="result-meta-label">Question ID</dt>
                <dd className="result-meta-value">{selectedResult.questionId}</dd>
                <dt className="result-meta-label">Timestamp</dt>
                <dd className="result-meta-value">{toDisplayTime(selectedResult.timestamp)}</dd>
              </dl>
              <h3>Question</h3>
              <pre>{selectedResult.question}</pre>
              {selectedResult.reasoning && (
                <details className="reasoning-block">
                  <summary>Reasoning</summary>
                  <pre>{selectedResult.reasoning}</pre>
                </details>
              )}
              <h3>Answer</h3>
              <pre>{selectedResult.answer}</pre>
              <h3>Judgment</h3>
              <pre>{selectedResult.judgment}</pre>
            </>
          ) : (
            <p className="no-results">No result matches the selected filters.</p>
          )}
        </article>
      </section>
    </div>
  );
}

export default App;
