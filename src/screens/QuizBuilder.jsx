import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { cachedFetch, TTL } from '../utils/cacheDB';
import { useNotification } from '../contexts/NotificationContext';
import './QuizBuilder.css';

const BLANK_ANSWERS = () => ([
  { id: 'a1', text: '', isCorrect: false },
  { id: 'a2', text: '', isCorrect: false },
  { id: 'a3', text: '', isCorrect: false },
  { id: 'a4', text: '', isCorrect: false }
]);

// Column names accepted in the import sheet
const normaliseHeader = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const pickCell = (row, names) => {
  const entry = Object.entries(row).find(([key]) => names.includes(normaliseHeader(key)));
  return entry ? String(entry[1] ?? '').trim() : '';
};

const QuizBuilder = () => {
  const mountedRef = useRef(true);
  const { showNotification } = useNotification();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetVideoId = searchParams.get('video');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [modules, setModules] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Start with ONE blank question
  const [questions, setQuestions] = useState([
    {
      id: 1,
      question: '',
      answers: [
        { id: 'a1', text: '', isCorrect: false },
        { id: 'a2', text: '', isCorrect: false },
        { id: 'a3', text: '', isCorrect: false },
        { id: 'a4', text: '', isCorrect: false }
      ]
    }
  ]);

  const [openQuestionIds, setOpenQuestionIds] = useState([1]);
  const importInputRef = useRef(null);

  const [quizConfig, setQuizConfig] = useState({
    title: '',
    module_id: '',
    video_id: '',
    passing_score: 60
  });

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Assessments', link: true, href: '/assessments' },
    { label: id ? 'Edit Quiz' : 'Add Assessment', link: false }
  ];

  // Fetch modules and videos on component mount
  useEffect(() => {
    mountedRef.current = true;
    fetchModules();
    fetchVideos();
    if (id) {
      fetchQuizData(id);
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchModules = async () => {
    try {
      const { data } = await cachedFetch('modules_list', async () => {
        const { data, error } = await supabase
          .from('modules')
          .select('id, title')
          .order('title', { ascending: true });
        if (error) throw error;
        return data || [];
      }, TTL.LONG);

      setModules(data);
    } catch (error) {
      console.error('Error fetching modules:', error);
    }
  };

  const fetchVideos = async () => {
    try {
      const { data } = await cachedFetch('videos_with_module', async () => {
        const { data, error } = await supabase
          .from('videos')
          .select('id, title, module_id')
          .order('title', { ascending: true });
        if (error) throw error;
        return data || [];
      }, TTL.LONG);

      setVideos(data);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };

  const fetchQuizData = async (quizId) => {
    try {
      setLoading(true);
      
      // Fetch quiz details
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (quizError) throw quizError;

      setQuizConfig({
        title: quizData.title || '',
        module_id: quizData.module_id || '',
        video_id: quizData.video_id || '',
        passing_score: quizData.passing_score || 60
      });

      // Fetch questions for this quiz
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('created_at', { ascending: true });

      if (questionsError) throw questionsError;

      // Transform questions data to match the state format
      if (questionsData && questionsData.length > 0) {
        const transformedQuestions = questionsData.map((q, index) => {
          const options = Array.isArray(q.options) ? q.options : [];
          
          return {
            id: index + 1,
            question: q.question_text,
            answers: options.map((opt, optIndex) => ({
              id: `a${optIndex + 1}`,
              text: opt,
              isCorrect: opt === q.correct_option
            }))
          };
        });
        
        setQuestions(transformedQuestions);
        setOpenQuestionIds([]);
      }
    } catch (error) {
      console.error('Error fetching quiz:', error);
      setError('Failed to load quiz data');
    } finally {
      setLoading(false);
    }
  };

  // A video sent from the Skill Matrix is selected on its own
  useEffect(() => {
    if (id || !presetVideoId || !videos.length) return;
    const video = videos.find(item => item.id === presetVideoId);
    if (!video) return;

    setQuizConfig(prev => ({
      ...prev,
      video_id: video.id,
      module_id: prev.module_id || video.module_id || '',
      title: prev.title || `${video.title} — Assessment`
    }));
  }, [id, presetVideoId, videos]);

  const handleMenuToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleQuizConfigChange = (field, value) => {
    setQuizConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleQuestionChange = (questionId, newQuestion) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, question: newQuestion } : q
    ));
  };

  const handleAnswerChange = (questionId, answerId, newText) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          answers: q.answers.map(a => 
            a.id === answerId ? { ...a, text: newText } : a
          )
        };
      }
      return q;
    }));
  };

  const handleCorrectAnswerChange = (questionId, answerId) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          answers: q.answers.map(a => ({
            ...a,
            isCorrect: a.id === answerId
          }))
        };
      }
      return q;
    }));
  };

  const nextQuestionId = (list) => list.reduce((max, item) => Math.max(max, item.id), 0) + 1;

  const addQuestion = () => {
    const newQuestion = {
      id: nextQuestionId(questions),
      question: '',
      answers: BLANK_ANSWERS()
    };
    setQuestions([...questions, newQuestion]);
    setOpenQuestionIds(prev => [...prev, newQuestion.id]);
  };

  const toggleQuestionOpen = (questionId) => {
    setOpenQuestionIds(prev => (
      prev.includes(questionId) ? prev.filter(item => item !== questionId) : [...prev, questionId]
    ));
  };

  const setAllOpen = (open) => {
    setOpenQuestionIds(open ? questions.map(question => question.id) : []);
  };

  // Excel format with one sample row
  const downloadFormat = () => {
    const sample = [{
      'Question': 'How does an influencer register a claim?',
      'Option 1': 'Through the DURO app',
      'Option 2': 'By calling the branch',
      'Option 3': 'By writing an email',
      'Option 4': 'At the dealer counter',
      'Correct Option': 'Option 1'
    }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sample), 'Questions');
    XLSX.writeFile(workbook, 'Assessment_Questions_Format.xlsx');
  };

  const handleImportClick = () => {
    if (importInputRef.current) importInputRef.current.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rows.length) {
        showNotification('This sheet has no rows', 'warning');
        return;
      }

      const imported = [];
      const skipped = [];

      rows.forEach((row, index) => {
        const questionText = pickCell(row, ['question', 'questiontext', 'questions']);
        const options = [
          pickCell(row, ['option1', 'optiona', 'a']),
          pickCell(row, ['option2', 'optionb', 'b']),
          pickCell(row, ['option3', 'optionc', 'c']),
          pickCell(row, ['option4', 'optiond', 'd'])
        ];
        const correctRaw = pickCell(row, ['correctoption', 'correctanswer', 'correct', 'answer']);

        if (!questionText || options.some(option => !option)) {
          skipped.push(index + 2);
          return;
        }

        // The correct answer can be the option text, or A B C D, or 1 2 3 4, or "Option 2"
        const cleaned = correctRaw.toLowerCase().replace(/^option\s*/, '').trim();
        let correctIndex = options.findIndex(option => option.toLowerCase() === correctRaw.toLowerCase());
        if (correctIndex === -1 && /^[abcd]$/.test(cleaned)) correctIndex = 'abcd'.indexOf(cleaned);
        if (correctIndex === -1 && /^[1-4]$/.test(cleaned)) correctIndex = Number(cleaned) - 1;

        if (correctIndex === -1) {
          skipped.push(index + 2);
          return;
        }

        imported.push({
          question: questionText,
          answers: options.map((text, optionIndex) => ({
            id: `a${optionIndex + 1}`,
            text,
            isCorrect: optionIndex === correctIndex
          }))
        });
      });

      if (!imported.length) {
        showNotification('No usable row found. Check the format file and the Correct Option column.', 'error');
        return;
      }

      setQuestions(prev => {
        // A single untouched blank question is replaced, anything filled in is kept
        const keep = prev.filter(question => (
          question.question.trim() || question.answers.some(answer => answer.text.trim())
        ));
        let nextId = nextQuestionId(keep.length ? keep : [{ id: 0 }]);
        const added = imported.map(item => ({ ...item, id: nextId++ }));
        return [...keep, ...added];
      });
      setOpenQuestionIds([]);

      showNotification(
        skipped.length
          ? `${imported.length} questions imported, ${skipped.length} rows skipped (row ${skipped.slice(0, 5).join(', ')})`
          : `${imported.length} questions imported`,
        skipped.length ? 'warning' : 'success'
      );
    } catch (importError) {
      console.error('Error importing questions:', importError);
      showNotification('Could not read this file: ' + (importError.message || 'Unknown error'), 'error');
    }
  };

  const deleteQuestion = (questionId) => {
    if (questions.length === 1) {
      showNotification('You must have at least one question', 'warning');
      return;
    }
    if (window.confirm('Are you sure you want to delete this question?')) {
      setQuestions(questions.filter(q => q.id !== questionId));
      setOpenQuestionIds(prev => prev.filter(item => item !== questionId));
    }
  };

  const handlePreview = () => {
    console.log('Preview quiz:', { quizConfig, questions });
    showNotification('Preview functionality will be implemented soon!', 'info');
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!quizConfig.title.trim()) {
        showNotification('Please enter a quiz title', 'warning');
        return;
      }
      if (!quizConfig.video_id) {
        showNotification('Please select a video', 'warning');
        return;
      }

      // Validate questions
      const hasEmptyQuestions = questions.some(q => !q.question.trim());
      if (hasEmptyQuestions) {
        showNotification('Please fill in all question texts', 'warning');
        return;
      }

      const hasEmptyAnswers = questions.some(q => 
        q.answers.some(a => !a.text.trim())
      );
      if (hasEmptyAnswers) {
        showNotification('Please fill in all answer options', 'warning');
        return;
      }

      const hasNoCorrectAnswer = questions.some(q => 
        !q.answers.some(a => a.isCorrect)
      );
      if (hasNoCorrectAnswer) {
        showNotification('Please select a correct answer for each question', 'warning');
        return;
      }

      setLoading(true);
      setError(null);

      const quizData = {
        title: quizConfig.title,
        module_id: quizConfig.module_id || null,
        video_id: quizConfig.video_id,
        passing_score: quizConfig.passing_score
      };

      let quizId = id;

      if (id) {
        // Update existing quiz
        const { error: quizError } = await supabase
          .from('quizzes')
          .update(quizData)
          .eq('id', id);

        if (quizError) throw quizError;

        // Delete existing questions for this quiz
        const { error: deleteError } = await supabase
          .from('questions')
          .delete()
          .eq('quiz_id', id);

        if (deleteError) throw deleteError;
      } else {
        // Create new quiz
        const { data: quizResult, error: quizError } = await supabase
          .from('quizzes')
          .insert([quizData])
          .select()
          .single();

        if (quizError) throw quizError;
        quizId = quizResult.id;
      }

      // Prepare questions data for insertion
      const questionsData = questions.map(q => {
        // Find the correct answer
        const correctAnswer = q.answers.find(a => a.isCorrect);
        
        // Prepare options as JSONB array
        const options = q.answers.map(a => a.text);

        return {
          quiz_id: quizId,
          question_text: q.question,
          options: options,
          correct_option: correctAnswer ? correctAnswer.text : options[0]
        };
      });

      // Insert all questions
      const { error: questionsError } = await supabase
        .from('questions')
        .insert(questionsData);

      if (questionsError) throw questionsError;

      showNotification(id ? 'Quiz updated successfully!' : 'Quiz created successfully!', 'success');
      navigate('/assessments');
    } catch (error) {
      console.error('Error saving quiz:', error);
      setError(error.message || 'Failed to save quiz');
      showNotification('Failed to save quiz: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
        <main className="quiz-builder-main">
            {/* Page Header */}
            <section className="quiz-builder-header">
              <div>
                <h2 className="page-title">{id ? 'Edit Assessment' : 'Create New Assessment'}</h2>
                <p className="page-subtitle">
                  {id ? 'Update quiz details and questions' : 'Add quiz details and questions for your video'}
                </p>
              </div>
              <div className="header-actions">
                <button className="btn-secondary" onClick={downloadFormat}>
                  <i className="fa-solid fa-file-excel"></i>
                  Download Format
                </button>
                <button className="btn-secondary" onClick={handleImportClick}>
                  <i className="fa-solid fa-file-arrow-up"></i>
                  Import Excel
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />
                <button className="btn-secondary" onClick={() => navigate('/assessments')}>
                  <i className="fa-solid fa-xmark"></i>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={loading}>
                  <i className="fa-solid fa-save"></i>
                  {loading ? 'Saving...' : 'Save Quiz'}
                </button>
              </div>
            </section>

            {/* Error Display */}
            {error && (
              <div className="error-message" style={{
                backgroundColor: '#FEE2E2',
                border: '1px solid #EF4444',
                color: '#991B1B',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{error}</span>
              </div>
            )}

            {/* Quiz Configuration */}
            <section className="quiz-config">
              <div className="config-grid">
                <div className="form-group">
                  <label htmlFor="quiz-title" className="form-label">Quiz Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input 
                    type="text" 
                    id="quiz-title"
                    value={quizConfig.title}
                    onChange={(e) => handleQuizConfigChange('title', e.target.value)}
                    className="form-input"
                    placeholder="e.g., Sales Funnel Basics Quiz"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="module-select" className="form-label">Module (Optional)</label>
                  <select 
                    id="module-select"
                    value={quizConfig.module_id}
                    onChange={(e) => handleQuizConfigChange('module_id', e.target.value)}
                    className="form-select"
                  >
                    <option value="">-- Select Module --</option>
                    {modules.map(module => (
                      <option key={module.id} value={module.id}>{module.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="video-id" className="form-label">Video <span style={{ color: '#EF4444' }}>*</span></label>
                  <select
                    id="video-id"
                    value={quizConfig.video_id}
                    onChange={(e) => handleQuizConfigChange('video_id', e.target.value)}
                    className="form-input"
                    required
                  >
                    <option value="">Select a video</option>
                    {videos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="passing-score" className="form-label">Passing Score (%)</label>
                  <input 
                    type="number" 
                    id="passing-score"
                    value={quizConfig.passing_score}
                    onChange={(e) => handleQuizConfigChange('passing_score', parseInt(e.target.value))}
                    className="form-input"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            </section>

            {/* Questions toolbar */}
            <section className="questions-toolbar">
              <span className="questions-count">
                Questions <strong>{questions.length}</strong>
              </span>
              <div className="questions-toolbar-actions">
                <button className="link-btn" onClick={() => setAllOpen(true)}>Expand all</button>
                <span className="toolbar-divider"></span>
                <button className="link-btn" onClick={() => setAllOpen(false)}>Collapse all</button>
              </div>
            </section>

            {/* Questions List */}
            <section className="questions-list">
              {questions.map((question, qIndex) => {
                const isOpen = openQuestionIds.includes(question.id);
                const correctAnswer = question.answers.find(answer => answer.isCorrect);

                if (!isOpen) {
                  return (
                    <div key={question.id} className="question-card is-collapsed">
                      <div className="question-summary">
                        <span className="question-number">{qIndex + 1}</span>
                        <div className="question-summary-text">
                          <strong>{question.question.trim() || 'Untitled question'}</strong>
                          <span>
                            {correctAnswer?.text
                              ? `Correct: ${correctAnswer.text}`
                              : 'Correct answer not selected'}
                          </span>
                        </div>
                        <div className="question-summary-actions">
                          <button className="edit-question-btn" onClick={() => toggleQuestionOpen(question.id)}>
                            <i className="fa-solid fa-pen"></i>
                            Edit
                          </button>
                          <button className="delete-question-btn" onClick={() => deleteQuestion(question.id)}>
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                <div key={question.id} className="question-card">
                  <div className="question-header">
                    <div className="question-input-container">
                      <i className="fa-solid fa-grip-vertical drag-handle"></i>
                      <input 
                        type="text" 
                        placeholder="Enter your question here..."
                        value={question.question}
                        onChange={(e) => handleQuestionChange(question.id, e.target.value)}
                        className="question-input"
                      />
                    </div>
                    <button 
                      className="delete-question-btn"
                      onClick={() => deleteQuestion(question.id)}
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                  <div className="answers-grid">
                    {question.answers.map((answer) => (
                      <div key={answer.id} className="answer-option">
                        <input 
                          type="radio" 
                          name={`q${question.id}-correct`}
                          id={`q${question.id}-${answer.id}`}
                          checked={answer.isCorrect}
                          onChange={() => handleCorrectAnswerChange(question.id, answer.id)}
                          className="answer-radio"
                        />
                        <label 
                          htmlFor={`q${question.id}-${answer.id}`}
                          className="answer-label"
                        >
                          <i className="fa-regular fa-circle radio-icon"></i>
                          <input 
                            type="text" 
                            value={answer.text}
                            onChange={(e) => handleAnswerChange(question.id, answer.id, e.target.value)}
                            placeholder="Enter answer option..."
                            className="answer-text-input"
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="question-card-foot">
                    <span className="question-hint">Select the radio button of the correct option.</span>
                    <button className="link-btn" onClick={() => toggleQuestionOpen(question.id)}>
                      <i className="fa-solid fa-check"></i>
                      Done
                    </button>
                  </div>
                </div>
                );
              })}
            </section>

            {/* Add Question Button */}
            <section className="add-question-section">
              <button className="add-question-btn" onClick={addQuestion}>
                <i className="fa-solid fa-plus"></i>
                Add Question
              </button>
            </section>
        </main>
  );
};

export default QuizBuilder;
