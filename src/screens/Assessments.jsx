import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { cachedFetch, TTL } from '../utils/cacheDB';
import { useNotification } from '../contexts/NotificationContext';
import './Assessments.css';

function Assessments() {
  const mountedRef = useRef(true);
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filterModule, setFilterModule] = useState('All Modules');
  const [filterStatus, setFilterStatus] = useState('All Status');
  const [quizzes, setQuizzes] = useState([]);
  const [modules, setModules] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Assessments', link: false }
  ];

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Fetch quizzes, modules, and videos from Supabase
  useEffect(() => {
    mountedRef.current = true;
    
    const loadData = async () => {
      await Promise.all([fetchModules(), fetchVideos(), fetchQuizzes()]);
    };
    
    loadData();
    
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const { data } = await cachedFetch('videos_list', async () => {
        const { data, error } = await supabase
          .from('videos')
          .select('id, title')
          .order('title', { ascending: true });
        if (error) throw error;
        return data || [];
      }, TTL.LONG);

      setVideos(data);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };

  const fetchQuizzes = async () => {
    console.log('fetchQuizzes started');
    try {
      setLoading(true);
      setError(null);

      // Fetch quizzes
      const { data: quizzesData, error: quizzesError } = await supabase
        .from('quizzes')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('Quizzes data:', quizzesData, 'Error:', quizzesError);

      if (quizzesError) {
        console.error('Error fetching quizzes:', quizzesError);
        throw quizzesError;
      }

      // If no quizzes, set empty array
      if (!quizzesData || quizzesData.length === 0) {
        console.log('No quizzes found');
        setQuizzes([]);
        return;
      }

      // Add question counts to each quiz
      const quizzesWithCounts = [];
      for (const quiz of quizzesData) {
        try {
          const { count, error: countError } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('quiz_id', quiz.id);

          if (countError) {
            console.error('Error fetching question count for quiz:', quiz.id, countError);
            quizzesWithCounts.push({ ...quiz, question_count: 0 });
          } else {
            quizzesWithCounts.push({ ...quiz, question_count: count || 0 });
          }
        } catch (err) {
          console.error('Error in question count fetch:', err);
          quizzesWithCounts.push({ ...quiz, question_count: 0 });
        }
      }

      console.log('Quizzes with counts:', quizzesWithCounts);
      setQuizzes(quizzesWithCounts);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      setError(error.message || 'Failed to fetch quizzes. Please check your connection.');
      setQuizzes([]);
    } finally {
      console.log('fetchQuizzes finished, setting loading to false');
      setLoading(false);
    }
  };

  const handleAddAssessment = () => {
    navigate('/quiz-builder');
  };

  const handleEditQuiz = (quizId) => {
    navigate(`/quiz-builder/${quizId}`);
  };

  const handleDeleteQuiz = async (quizId) => {
    if (!window.confirm('Are you sure you want to delete this assessment? All associated questions will also be deleted.')) {
      return;
    }

    try {
      // First, delete all questions associated with this quiz
      const { error: questionsError } = await supabase
        .from('questions')
        .delete()
        .eq('quiz_id', quizId);

      if (questionsError) throw questionsError;

      // Then delete the quiz
      const { error: quizError } = await supabase
        .from('quizzes')
        .delete()
        .eq('id', quizId);

      if (quizError) throw quizError;

      await fetchQuizzes();
      showNotification('Assessment deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting quiz:', error);
      showNotification('Failed to delete assessment: ' + (error.message || 'Unknown error'), 'error');
    }
  };

  const getModuleName = (moduleId) => {
    if (!moduleId) return 'N/A';
    const module = modules.find(m => m.id === moduleId);
    return module ? module.title : 'N/A';
  };

  const getVideoName = (videoId) => {
    if (!videoId) return 'N/A';
    const video = videos.find(v => v.id === videoId);
    return video ? video.title : 'N/A';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const filteredQuizzes = quizzes.filter(quiz => {
    const matchSearch = quiz.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchModule = filterModule === 'All Modules' || quiz.module_id === filterModule;
    const matchStatus = filterStatus === 'All Status' || quiz.status === filterStatus;
    return matchSearch && matchModule && matchStatus;
  });

  return (
        <main className="assessments-main">
          <section className="assessments-header">
            <div>
              <h2>Assessments & Quizzes</h2>
              <p>Create and manage quizzes for training modules.</p>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary" onClick={fetchQuizzes}>
                <i className="fa-solid fa-arrows-rotate"></i>Refresh
              </button>
              <button className="btn btn-primary" onClick={handleAddAssessment}>
                <i className="fa-solid fa-plus"></i>Add Assessment
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

          <section className="assessments-table-container">
            <div className="table-filters">
              <div className="search-wrapper">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input 
                  type="text" 
                  placeholder="Search assessments..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-select-wrapper">
                <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
                  <option value="All Modules">All Modules</option>
                  {modules.map(module => (
                    <option key={module.id} value={module.id}>{module.title}</option>
                  ))}
                </select>
              </div>
              <div className="filter-select-wrapper">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option>All Status</option>
                  <option>Published</option>
                  <option>Draft</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                padding: '60px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px', fontSize: '20px' }}></i>
                Loading assessments...
              </div>
            ) : filteredQuizzes.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-clipboard-question" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
                <p style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>No assessments found</p>
                <p style={{ fontSize: '14px' }}>
                  {quizzes.length === 0 
                    ? 'Get started by creating your first assessment.' 
                    : 'Try adjusting your search or filter criteria.'}
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="assessments-table">
                  <thead>
                    <tr>
                      <th>Quiz Title</th>
                      <th>Module</th>
                      <th>Video ID</th>
                      <th>Questions</th>
                      <th>Passing Score</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuizzes.map(quiz => (
                      <tr key={quiz.id}>
                        <td>
                          <div className="quiz-title-cell">
                            <i className="fa-solid fa-clipboard-question quiz-icon"></i>
                            <span className="quiz-name">{quiz.title}</span>
                          </div>
                        </td>
                        <td>
                          <span className="module-name">{getModuleName(quiz.module_id)}</span>
                        </td>
                        <td>
                          <span className="video-name">{getVideoName(quiz.video_id)}</span>
                        </td>
                        <td>
                          <span className="question-count">{quiz.question_count || 0}</span>
                        </td>
                        <td>
                          <span className="passing-score">{quiz.passing_score}%</span>
                        </td>
                        <td>
                          <span className="date-text">{formatDate(quiz.created_at)}</span>
                        </td>
                        <td>
                          <div className="action-buttons-cell">
                            <button 
                              className="action-btn edit-btn" 
                              onClick={() => handleEditQuiz(quiz.id)}
                              title="Edit Quiz"
                            >
                              <i className="fa-solid fa-pencil"></i>
                            </button>
                            <button 
                              className="action-btn delete-btn" 
                              onClick={() => handleDeleteQuiz(quiz.id)}
                              title="Delete Quiz"
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
  );
};

export default Assessments;
