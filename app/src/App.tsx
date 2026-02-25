import { useEffect, useMemo, useState } from 'react';
import type { BenchResult, GeneratedData } from './types';

type TabId = 'correctness' | 'cost' | 'latency';

const pct = (value: number) => `${value.toFixed(1)}%`;
const fmtNumber = (value: number) => value.toLocaleString();
const fmtUsd = (value: number) => `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
const fmtMs = (value: number) => `${Math.round(value).toLocaleString()} ms`;

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
  const [activeTab, setActiveTab] = useState<TabId>('correctness');
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

  const costRankedModels = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.models
      .filter((model) => model.costSampleCount > 0)
      .slice()
      .sort((a, b) => a.avgCostUsd - b.avgCostUsd);
  }, [data]);

  const tokenRankedModels = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.models
      .filter((model) => model.tokenSampleCount > 0)
      .slice()
      .sort((a, b) => b.avgTotalTokens - a.avgTotalTokens);
  }, [data]);

  const latencyRankedModels = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.models
      .filter((model) => model.latencySampleCount > 0)
      .slice()
      .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  }, [data]);

  const rightFastRankedModels = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.models
      .filter((model) => model.latencySampleCount > 0)
      .map((model) => ({
        ...model,
        rightFastScore: model.passRate / Math.max(model.avgLatencyMs, 1),
      }))
      .sort((a, b) => {
        if (b.rightFastScore !== a.rightFastScore) {
          return b.rightFastScore - a.rightFastScore;
        }
        if (b.passRate !== a.passRate) {
          return b.passRate - a.passRate;
        }
        return a.avgLatencyMs - b.avgLatencyMs;
      });
  }, [data]);

  const rightFastWinner = rightFastRankedModels[0];
  const rightFastTopIds = new Set(rightFastRankedModels.slice(0, 3).map((model) => model.id));

  const slowestResults = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.results
      .filter((item) => typeof item.latencyMs === 'number')
      .slice()
      .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))
      .slice(0, 15);
  }, [data]);

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

  const maxCost = Math.max(...costRankedModels.map((item) => item.avgCostUsd), 0);
  const maxTokens = Math.max(...tokenRankedModels.map((item) => item.avgTotalTokens), 0);
  const maxLatency = Math.max(...latencyRankedModels.map((item) => item.avgLatencyMs), 0);

  return (
    <div className="container">
      <header>
        <h1>Trick Question Bench</h1>
        <p>Model correctness, cost/token efficiency, and response-time performance in one dashboard.</p>
        <span className="header-meta">Generated {toDisplayTime(data.generatedAt)}</span>
      </header>

      <nav className="tabs" aria-label="Dashboard pages">
        <button
          type="button"
          className={`tab-button ${activeTab === 'correctness' ? 'active' : ''}`}
          onClick={() => setActiveTab('correctness')}
        >
          Correctness
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'cost' ? 'active' : ''}`}
          onClick={() => setActiveTab('cost')}
        >
          Cost & Tokens
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'latency' ? 'active' : ''}`}
          onClick={() => setActiveTab('latency')}
        >
          Response Time
        </button>
      </nav>

      {activeTab === 'correctness' && (
        <>
          <section className="stat-grid">
            <article className="stat-card">
              <h3>Results</h3>
              <p>{fmtNumber(data.totals.results)}</p>
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
              <p>{fmtNumber(data.totals.passed)}</p>
            </article>
            <article className="stat-card">
              <h3>Failed</h3>
              <p>{fmtNumber(data.totals.failed)}</p>
            </article>
            <article className="stat-card">
              <h3>Needs review</h3>
              <p>{fmtNumber(data.totals.needsHumanReview)}</p>
            </article>
          </section>

          <section className="chart-grid">
            <article className="panel">
              <h2>Model leaderboard</h2>
              <div className="bar-list scrollable-list">
                {rankedModels.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`bar-row bar-row-interactive ${selectedModel === model.id ? 'active' : ''}`}
                    onClick={() => setSelectedModel(selectedModel === model.id ? 'all' : model.id)}
                  >
                    <span className="truncate">
                      {model.label}
                      {rightFastTopIds.has(model.id) && <span className="glaze-chip">⚡✓</span>}
                    </span>
                    <div className="bar-bg">
                      <div className="bar-fill" style={{ width: `${model.passRate}%` }} />
                    </div>
                    <span>{pct(model.passRate)}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>Pass rate by provider</h2>
              <div className="bar-list scrollable-list">
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
              <div className="bar-list scrollable-list">
                {data.questions
                  .slice()
                  .sort((a, b) => {
                    const aPassRate = a.total > 0 ? a.passed / a.total : 0;
                    const bPassRate = b.total > 0 ? b.passed / b.total : 0;
                    if (aPassRate !== bPassRate) {
                      return aPassRate - bPassRate;
                    }
                    return b.total - a.total;
                  })
                  .map((question) => {
                    const passRate = question.total > 0 ? (question.passed / question.total) * 100 : 0;
                    return (
                      <button
                        type="button"
                        className={`bar-row bar-row-interactive ${selectedQuestion === question.id ? 'active' : ''}`}
                        key={question.id}
                        onClick={() => setSelectedQuestion(selectedQuestion === question.id ? 'all' : question.id)}
                      >
                        <span className="truncate">{question.id}</span>
                        <div className="bar-bg">
                          <div className="bar-fill danger" style={{ width: `${passRate}%` }} />
                        </div>
                        <span>
                          {question.passed}/{question.total}
                        </span>
                      </button>
                    );
                  })}
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
              <h2>
                Results ({filteredResults.length}
                {hasActiveFilters ? ` of ${data.results.length}` : ''})
              </h2>
              <ul>
                {filteredResults.map((item) => (
                  <li key={item.id}>
                    <button
                      className={selectedResult?.id === item.id ? 'active' : ''}
                      onClick={() => setSelectedResultId(item.id)}
                      type="button"
                    >
                      <div className="result-item">
                        <span className={`verdict-badge ${item.passed ? 'pass' : 'fail'}`}>{item.passed ? 'Pass' : 'Fail'}</span>
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
                    {selectedResult.needsHumanReview && <span className="verdict-badge review">Needs review</span>}
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
        </>
      )}

      {activeTab === 'cost' && (
        <>
          <section className="stat-grid">
            <article className="stat-card">
              <h3>Total cost</h3>
              <p>{fmtUsd(data.totals.metrics.totalCostUsd)}</p>
            </article>
            <article className="stat-card">
              <h3>Avg cost / response</h3>
              <p>{fmtUsd(data.totals.metrics.avgCostUsd)}</p>
            </article>
            <article className="stat-card">
              <h3>Total tokens</h3>
              <p>{fmtNumber(data.totals.metrics.totalTokens)}</p>
            </article>
            <article className="stat-card">
              <h3>Avg tokens / response</h3>
              <p>{fmtNumber(data.totals.metrics.avgTotalTokens)}</p>
            </article>
            <article className="stat-card">
              <h3>Token samples</h3>
              <p>{fmtNumber(data.totals.metrics.tokenSampleCount)}</p>
            </article>
            <article className="stat-card">
              <h3>Cost samples</h3>
              <p>{fmtNumber(data.totals.metrics.costSampleCount)}</p>
            </article>
          </section>

          <section className="chart-grid">
            <article className="panel">
              <h2>Average cost per model</h2>
              <div className="bar-list scrollable-list">
                {costRankedModels.map((model) => (
                  <div className="bar-row" key={model.id}>
                    <span className="truncate">{model.label}</span>
                    <div className="bar-bg">
                      <div
                        className="bar-fill alt"
                        style={{ width: `${maxCost > 0 ? (model.avgCostUsd / maxCost) * 100 : 0}%` }}
                      />
                    </div>
                    <span>{fmtUsd(model.avgCostUsd)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>Average tokens per model</h2>
              <div className="bar-list scrollable-list">
                {tokenRankedModels.map((model) => (
                  <div className="bar-row" key={model.id}>
                    <span className="truncate">{model.label}</span>
                    <div className="bar-bg">
                      <div
                        className="bar-fill"
                        style={{ width: `${maxTokens > 0 ? (model.avgTotalTokens / maxTokens) * 100 : 0}%` }}
                      />
                    </div>
                    <span>{fmtNumber(model.avgTotalTokens)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>Cost vs correctness</h2>
              <div className="metric-grid">
                {costRankedModels.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`metric-card ${selectedModel === model.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setActiveTab('correctness');
                    }}
                  >
                    <h3>{model.label}</h3>
                    <div className="metric-line">
                      <span>Pass rate</span>
                      <strong>{pct(model.passRate)}</strong>
                    </div>
                    <div className="metric-line">
                      <span>Avg cost</span>
                      <strong>{fmtUsd(model.avgCostUsd)}</strong>
                    </div>
                    <div className="metric-line">
                      <span>Avg tokens</span>
                      <strong>{fmtNumber(model.avgTotalTokens)}</strong>
                    </div>
                  </button>
                ))}
              </div>
            </article>
          </section>
        </>
      )}

      {activeTab === 'latency' && (
        <>
          <section className="stat-grid">
            <article className="stat-card">
              <h3>Total measured time</h3>
              <p>{fmtMs(data.totals.metrics.totalLatencyMs)}</p>
            </article>
            <article className="stat-card">
              <h3>Avg response time</h3>
              <p>{fmtMs(data.totals.metrics.avgLatencyMs)}</p>
            </article>
            <article className="stat-card">
              <h3>Latency samples</h3>
              <p>{fmtNumber(data.totals.metrics.latencySampleCount)}</p>
            </article>
            {rightFastWinner && (
              <article className="stat-card">
                <h3>Right + Fast Winner</h3>
                <p className="accent-pass">{rightFastWinner.label}</p>
              </article>
            )}
          </section>

          <section className="chart-grid">
            <article className="panel">
              <h2>Average latency by model</h2>
              <div className="bar-list scrollable-list">
                {latencyRankedModels.map((model) => (
                  <div className="bar-row" key={model.id}>
                    <span className="truncate">{model.label}</span>
                    <div className="bar-bg">
                      <div
                        className="bar-fill warn"
                        style={{ width: `${maxLatency > 0 ? (model.avgLatencyMs / maxLatency) * 100 : 0}%` }}
                      />
                    </div>
                    <span>{fmtMs(model.avgLatencyMs)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>Right + fast leaders</h2>
              <ul className="compact-list">
                {rightFastRankedModels.slice(0, 12).map((model) => (
                  <li key={model.id}>
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => {
                        setSelectedModel(model.id);
                        setActiveTab('correctness');
                      }}
                    >
                      <span className="truncate">
                        {model.label}
                        <span className="compact-meta">{pct(model.passRate)} · {fmtMs(model.avgLatencyMs)}</span>
                      </span>
                      <span>⚡✓</span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2>Slowest individual responses</h2>
              <ul className="compact-list">
                {slowestResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => {
                        setSelectedModel(item.modelId);
                        setSelectedQuestion(item.questionId);
                        setSelectedResultId(item.id);
                        setActiveTab('correctness');
                      }}
                    >
                      <span className="truncate">{item.modelName} · {item.questionId}</span>
                      <span>{fmtMs(item.latencyMs ?? 0)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
