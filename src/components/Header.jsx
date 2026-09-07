import { useState } from 'react'
import './Header.css'

function Header({ breadcrumbItems, onMenuToggle }) {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <header className="header">
      <div className="breadcrumb">
        <button 
          className="menu-toggle"
          onClick={onMenuToggle}
        >
          <i className="fa-solid fa-bars"></i>
        </button>
        {breadcrumbItems.map((item, index) => (
          <span key={index} className="breadcrumb-item">
            {item.link ? (
              <a href="#" onClick={(e) => e.preventDefault()}>{item.label}</a>
            ) : (
              <span className="current">{item.label}</span>
            )}
            {index < breadcrumbItems.length - 1 && (
              <i className="fa-solid fa-chevron-right separator"></i>
            )}
          </span>
        ))}
      </div>
      <div className="header-actions">
        <div className="search-box">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="notification-btn">
          <i className="fa-regular fa-bell"></i>
          <span className="notification-badge"></span>
        </button>
      </div>
    </header>
  )
}

export default Header
export { Header }
