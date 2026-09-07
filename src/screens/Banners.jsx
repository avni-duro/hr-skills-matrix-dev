import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB';
import { useNotification } from '../contexts/NotificationContext';
import './Banners.css';

const Banners = () => {
  const mountedRef = useRef(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [banners, setBanners] = useState([]);
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [editingBanner, setEditingBanner] = useState(null);
  const [editingBannerId, setEditingBannerId] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    redirectType: '',
    redirectId: '',
    image: null,
    imagePreview: '',
    isActive: true,
    displayOrder: 0
  });

  // Dropdown options
  const [videos, setVideos] = useState([]);
  const [modules, setModules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const breadcrumbItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Banner Management', href: '/banners', active: true }
  ];

  useEffect(() => {
    mountedRef.current = true;
    fetchBanners();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (formData.redirectType) {
      fetchRedirectOptions(formData.redirectType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.redirectType]);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      // Fetch related data for each banner
      const bannersWithDetails = await Promise.all(
        data.map(async (banner) => {
          let redirectDetails = null;

          if (banner.redirect_type === 'video' && banner.redirect_id) {
            const { data: video } = await supabase
              .from('videos')
              .select('title')
              .eq('id', banner.redirect_id)
              .single();
            redirectDetails = video?.title;
          } else if (banner.redirect_type === 'module' && banner.redirect_id) {
            const { data: module } = await supabase
              .from('modules')
              .select('title')
              .eq('id', banner.redirect_id)
              .single();
            redirectDetails = module?.title;
          } else if (banner.redirect_type === 'category' && banner.redirect_id) {
            const { data: category } = await supabase
              .from('categories')
              .select('name')
              .eq('id', banner.redirect_id)
              .single();
            redirectDetails = category?.name;
          }

          return { ...banner, redirectDetails };
        })
      );

      setBanners(bannersWithDetails);
    } catch (error) {
      console.error('Error fetching banners:', error);
      showNotification('Failed to fetch banners', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRedirectOptions = async (type) => {
    setLoadingOptions(true);
    try {
      if (type === 'video') {
        const { data } = await cachedFetch('videos_list', async () => {
          const { data, error } = await supabase
            .from('videos')
            .select('id, title')
            .order('title', { ascending: true });
          if (error) throw error;
          return data || [];
        }, TTL.LONG);
        setVideos(data);
      } else if (type === 'module') {
        const { data } = await cachedFetch('modules_list', async () => {
          const { data, error } = await supabase
            .from('modules')
            .select('id, title')
            .order('title', { ascending: true });
          if (error) throw error;
          return data || [];
        }, TTL.LONG);
        setModules(data);
      } else if (type === 'category') {
        const { data } = await cachedFetch('categories_list', async () => {
          const { data, error } = await supabase
            .from('categories')
            .select('id, name')
            .order('name', { ascending: true });
          if (error) throw error;
          return data || [];
        }, TTL.LONG);
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching redirect options:', error);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleMenuToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const openModal = (banner = null) => {
    console.log('openModal called with:', banner);
    if (banner) {
      setEditingBanner(banner);
      setEditingBannerId(banner.id || null);
      setFormData({
        title: banner.title,
        redirectType: banner.redirect_type,
        redirectId: banner.redirect_id,
        image: null,
        imagePreview: banner.image_url,
        isActive: banner.is_active,
        displayOrder: banner.display_order
      });
    } else {
      setEditingBanner(null);
      setEditingBannerId(null);
    }
    setIsModalOpen(true);
    setTimeout(() => {
      document.querySelector('.modal-content')?.classList.add('modal-open');
    }, 10);
  };

  const closeModal = () => {
    document.querySelector('.modal-content')?.classList.remove('modal-open');
    setTimeout(() => {
      setIsModalOpen(false);
      setEditingBanner(null);
      setEditingBannerId(null);
      setFormData({
        title: '',
        redirectType: '',
        redirectId: '',
        image: null,
        imagePreview: '',
        isActive: true,
        displayOrder: 0
      });
      setVideos([]);
      setModules([]);
      setCategories([]);
    }, 200);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset redirectId when redirectType changes
      ...(name === 'redirectType' ? { redirectId: '' } : {})
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        image: file,
        imagePreview: URL.createObjectURL(file)
      }));
    }
  };

  const uploadImage = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      console.log('Uploading image to:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('banner-images')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Image upload failed: ${uploadError.message}`);
      }

      console.log('Upload successful:', uploadData);

      const { data } = supabase.storage
        .from('banner-images')
        .getPublicUrl(filePath);

      console.log('Public URL:', data.publicUrl);
      return data.publicUrl;
    } catch (error) {
      console.error('Error in uploadImage:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Validation - title is now optional
      if (!formData.redirectType) {
        showNotification('Please select a redirect type', 'warning');
        return;
      }

      if (!formData.redirectId) {
        showNotification('Please select a redirect target', 'warning');
        return;
      }

      if (!editingBanner && !formData.image) {
        showNotification('Please select an image', 'warning');
        return;
      }

      let imageUrl = editingBanner?.image_url || '';

      // Upload new image if selected
      if (formData.image) {
        console.log('Starting image upload...');
        imageUrl = await uploadImage(formData.image);
        console.log('Image uploaded successfully, URL:', imageUrl);
      }

      const bannerData = {
        title: formData.title.trim() || null, // Allow null/empty title
        image_url: imageUrl,
        redirect_type: formData.redirectType,
        redirect_id: formData.redirectId,
        is_active: formData.isActive,
        display_order: Number.isNaN(parseInt(formData.displayOrder, 10))
          ? 0
          : parseInt(formData.displayOrder, 10),
        updated_at: new Date().toISOString()
      };

      console.log('Saving banner data:', bannerData);

      if (editingBanner) {
        if (!editingBannerId) {
          console.error('Missing banner id for update', { editingBanner, editingBannerId });
          showNotification('Cannot update this banner because its ID is missing. Please reload the page and try again.', 'warning');
          return;
        }
        // Update existing banner
        console.log('Updating banner:', editingBannerId);
        const { data, error } = await supabase
          .from('banners')
          .update(bannerData)
          .eq('id', editingBannerId);

        if (error) {
          console.error('Update error:', error);
          throw new Error(`Update failed: ${error.message}`);
        }
        console.log('Update response:', data);
        showNotification('Banner updated successfully!', 'success');
      } else {
        // Create new banner
        console.log('Creating new banner...');
        const { data, error } = await supabase
          .from('banners')
          .insert([bannerData])
          .select();

        if (error) {
          console.error('Insert error:', error);
          throw new Error(`Insert failed: ${error.message}`);
        }
        console.log('Insert response:', data);
        showNotification('Banner created successfully!', 'success');
      }

      closeModal();
      fetchBanners();
    } catch (error) {
      console.error('Error saving banner:', error);
      showNotification('Failed to save banner: ' + error.message, 'error');
    }
  };

  const toggleBannerStatus = async (banner) => {
    try {
      const { error } = await supabase
        .from('banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id);

      if (error) throw error;

      fetchBanners();
    } catch (error) {
      console.error('Error toggling banner status:', error);
      showNotification('Failed to update banner status', 'error');
    }
  };

  const deleteBanner = async (id) => {
    if (!window.confirm('Are you sure you want to delete this banner?')) return;

    try {
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showNotification('Banner deleted successfully!', 'success');
      fetchBanners();
    } catch (error) {
      console.error('Error deleting banner:', error);
      showNotification('Failed to delete banner', 'error');
    }
  };

  const editBanner = (banner) => {
    console.log('editBanner called with:', banner);
    openModal(banner);
  };

  const getRedirectOptions = () => {
    if (formData.redirectType === 'video') return videos;
    if (formData.redirectType === 'module') return modules;
    if (formData.redirectType === 'category') return categories;
    return [];
  };

  const getRedirectOptionLabel = (option) => {
    if (formData.redirectType === 'category') return option.name;
    return option.title;
  };

  return (
    <>
        <main className="banners-main">
            <div className="section-header">
              <h2 className="page-title">Banners</h2>
              <button className="btn-primary" onClick={() => openModal(null)}>
                <i className="fa-solid fa-plus"></i>
                <span>Add Banner</span>
              </button>
            </div>

            <div className="banner-grid">
              {loading ? (
                <div className="loading-state">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <p>Loading banners...</p>
                </div>
              ) : banners.length === 0 ? (
                <div className="empty-state">
                  <i className="fa-solid fa-image"></i>
                  <p>No banners found</p>
                  <button className="btn-primary" onClick={() => openModal()}>
                    Add Your First Banner
                  </button>
                </div>
              ) : (
                banners.map(banner => (
                  <div key={banner.id} className="banner-card">
                    <div className="banner-image-container">
                      <img 
                        src={banner.image_url} 
                        alt={banner.title || 'Banner'}
                        className="banner-image"
                      />
                      <div className="banner-overlay">
                        <div className="banner-actions">
                          <button 
                            className="action-btn edit-btn"
                            onClick={() => editBanner(banner)}
                          >
                            <i className="fa-solid fa-pencil"></i>
                          </button>
                          <button 
                            className="action-btn delete-btn"
                            onClick={() => deleteBanner(banner.id)}
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="banner-details">
                      <h3 className="banner-title">{banner.title || '(No Title)'}</h3>
                      <p className="banner-redirect">
                        <span className={`type-badge ${banner.redirect_type}`}>
                          {banner.redirect_type}
                        </span>
                        <span className="redirect-target">{banner.redirectDetails || 'N/A'}</span>
                      </p>
                      <div className="banner-status">
                        <label className="toggle-container">
                          <input 
                            type="checkbox" 
                            checked={banner.is_active}
                            onChange={() => toggleBannerStatus(banner)}
                            className="toggle-input"
                          />
                          <div className="toggle-track"></div>
                          <div className="toggle-thumb"></div>
                          <span className={`toggle-label ${banner.is_active ? 'active' : 'inactive'}`}>
                            {banner.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
        </main>

      {/* Add Banner Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingBanner ? 'Edit Banner' : 'Add New Banner'}
              </h3>
              <button className="modal-close-btn" onClick={closeModal}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                  <label htmlFor="title" className="form-label">Banner Title (Optional)</label>
                  <input 
                    type="text" 
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g., Summer Sale"
                    className="form-input"
                  />
                </div>

              {/* Banner Image Upload */}
              <div className="form-group">
                <label className="form-label">Banner Image * (Recommended: 1200x400px)</label>
                <div className="file-upload-container">
                  {formData.imagePreview ? (
                    <div className="image-preview-container">
                      <img src={formData.imagePreview} alt="Preview" className="image-preview" />
                      <button
                        type="button"
                        className="remove-image-btn"
                        onClick={() => setFormData(prev => ({ ...prev, image: null, imagePreview: '' }))}
                      >
                        <i className="fa-solid fa-times"></i> Remove
                      </button>
                    </div>
                  ) : (
                    <div className="file-upload-content">
                      <i className="fa-solid fa-cloud-arrow-up file-upload-icon"></i>
                      <div className="file-upload-text">
                        <label htmlFor="file-upload" className="file-upload-label">
                          <span>Upload a file</span>
                          <input 
                            id="file-upload" 
                            name="file-upload" 
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="file-upload-input"
                          />
                        </label>
                        <p className="file-upload-drag">or drag and drop</p>
                      </div>
                      <p className="file-upload-info">PNG, JPG, GIF up to 10MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Redirect Type Dropdown */}
              <div className="form-group">
                <label htmlFor="redirectType" className="form-label">Redirect Type *</label>
                <select
                  id="redirectType"
                  name="redirectType"
                  value={formData.redirectType}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                >
                  <option value="">Select redirect type</option>
                  <option value="video">Video</option>
                  <option value="module">Module</option>
                  <option value="category">Category</option>
                </select>
              </div>

              {/* Dynamic Redirect Target Dropdown */}
              {formData.redirectType && (
                <div className="form-group">
                  <label htmlFor="redirectId" className="form-label">
                    Select {formData.redirectType.charAt(0).toUpperCase() + formData.redirectType.slice(1)} *
                  </label>
                  {loadingOptions ? (
                    <div className="loading-options">
                      <i className="fa-solid fa-spinner fa-spin"></i> Loading options...
                    </div>
                  ) : (
                    <select
                      id="redirectId"
                      name="redirectId"
                      value={formData.redirectId}
                      onChange={handleInputChange}
                      className="form-input"
                      required
                    >
                      <option value="">Select {formData.redirectType}</option>
                      {getRedirectOptions().map((option) => (
                        <option key={option.id} value={option.id}>
                          {getRedirectOptionLabel(option)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Display Order */}
              <div className="form-group">
                <label htmlFor="displayOrder" className="form-label">Display Order</label>
                <input
                  type="number"
                  id="displayOrder"
                  name="displayOrder"
                  value={formData.displayOrder}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="form-input"
                />
                <small className="form-hint">Lower numbers appear first in the mobile app</small>
              </div>

              {/* Active Status */}
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span>Active (Show in mobile app)</span>
                </label>
              </div>
              </form>
            </div>

            <div className="modal-footer">
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleSubmit}>
                  <i className="fa-solid fa-save"></i>
                  {editingBanner ? 'Update Banner' : 'Save Banner'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Banners;
