import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './OrgChart.css'

function buildOrgTree(users) {
  const userByEmployeeId = new Map()
  const rootNodes = []

  users.forEach(user => {
    const employeeId = (user.employeeId || '').trim()
    if (!employeeId) return
    userByEmployeeId.set(employeeId, { ...user, children: [] })
  })

  userByEmployeeId.forEach((node) => {
    const managerId = (node.reportingManager || '').trim()
    const managerNode = managerId ? userByEmployeeId.get(managerId) : null

    if (managerNode && managerNode.employeeId !== node.employeeId) {
      managerNode.children.push(node)
    } else {
      rootNodes.push(node)
    }
  })

  const sortTree = (nodes) => {
    nodes.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    nodes.forEach(node => sortTree(node.children))
  }

  sortTree(rootNodes)
  return rootNodes
}

const getTrackClass = (department = '') => {
  const value = department.toLowerCase()
  if (value.includes('sales') || value.includes('marketing')) return 'sales'
  return 'engineering'
}

const TreeNode = ({ node }) => {
  const hasChildren = node.children.length > 0
  const directReportsText = `${node.children.length} direct report${node.children.length === 1 ? '' : 's'}`
  const trackClass = getTrackClass(node.department)

  return (
    <li className="org-node-item">
      <div className={`org-node-card ${node.isRoot ? 'is-root' : ''} org-track-${trackClass}`}>
        <span className="org-node-accent" aria-hidden="true"></span>
        <div className="org-node-avatar">{node.initials}</div>
        <div className="org-node-content">
          <h3>{node.name}</h3>
          <p>{node.designation}</p>
          <span className="org-node-detail">
            {hasChildren ? directReportsText : (node.department || node.branch || 'Unassigned')}
          </span>
        </div>
      </div>

      {hasChildren && (
        <ul className="org-tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function OrgChart() {
  const { showNotification } = useNotification()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fitScale, setFitScale] = useState(1)
  const [scaledSize, setScaledSize] = useState({ width: 0, height: 0 })
  const shellRef = useRef(null)
  const treeRef = useRef(null)

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const result = await cachedFetch('org_chart_users', async () => {
        const pageSize = 1000
        let page = 0
        let allRows = []
        let hasMore = true

        while (hasMore) {
          const from = page * pageSize
          const to = from + pageSize - 1

          const { data, error } = await supabase
            .from('users')
            .select('id, full_name, employee_id, reporting_manager, designation_id, department_id, branch_id, status')
            .order('full_name', { ascending: true })
            .range(from, to)

          if (error) throw error
          allRows = allRows.concat(data || [])
          hasMore = (data || []).length === pageSize
          page += 1
        }

        const designationIds = [...new Set(allRows.map(u => u.designation_id).filter(Boolean))]
        const departmentIds = [...new Set(allRows.map(u => u.department_id).filter(Boolean))]
        const branchIds = [...new Set(allRows.map(u => u.branch_id).filter(Boolean))]

        const [designationsData, departmentsData, branchesData] = await Promise.all([
          designationIds.length > 0
            ? supabase.from('designations').select('id, designation_name').in('id', designationIds)
            : Promise.resolve({ data: [] }),
          departmentIds.length > 0
            ? supabase.from('departments').select('id, department_name').in('id', departmentIds)
            : Promise.resolve({ data: [] }),
          branchIds.length > 0
            ? supabase.from('branches').select('id, branch_name').in('id', branchIds)
            : Promise.resolve({ data: [] })
        ])

        const designationMap = new Map(designationsData.data?.map(item => [item.id, item.designation_name]) || [])
        const departmentMap = new Map(departmentsData.data?.map(item => [item.id, item.department_name]) || [])
        const branchMap = new Map(branchesData.data?.map(item => [item.id, item.branch_name]) || [])

        return allRows.map(user => ({
          id: user.id,
          name: user.full_name || 'N/A',
          employeeId: user.employee_id || '',
          reportingManager: user.reporting_manager || '',
          designation: designationMap.get(user.designation_id) || 'N/A',
          department: departmentMap.get(user.department_id) || 'N/A',
          branch: branchMap.get(user.branch_id) || 'N/A',
          status: user.status || 'active',
          initials: (user.full_name || 'N/A')
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join('') || 'U'
        }))
      }, TTL.LONG)

      setUsers(Array.isArray(result?.data) ? result.data : [])
    } catch (error) {
      console.error('Error loading org chart users:', error)
      showNotification(`Failed to load org chart: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const treeData = useMemo(() => {
    const filteredUsers = searchQuery.trim()
      ? users.filter(user => {
          const query = searchQuery.toLowerCase()
          return (
            (user.name || '').toLowerCase().includes(query) ||
            (user.employeeId || '').toLowerCase().includes(query) ||
            (user.designation || '').toLowerCase().includes(query) ||
            (user.department || '').toLowerCase().includes(query) ||
            (user.branch || '').toLowerCase().includes(query)
          )
        })
      : users

    return buildOrgTree(filteredUsers).map(node => ({ ...node, isRoot: true }))
  }, [users, searchQuery])

  const totalUsers = users.length
  const totalRoots = treeData.length

  useEffect(() => {
    const applyFitScale = () => {
      if (!shellRef.current || !treeRef.current || loading || treeData.length === 0) return

      const shell = shellRef.current
      const tree = treeRef.current

      const naturalWidth = tree.scrollWidth
      const naturalHeight = tree.scrollHeight
      const availableWidth = Math.max(shell.clientWidth - 16, 1)
      const availableHeight = Math.max(shell.clientHeight - 16, 1)

      const widthScale = availableWidth / Math.max(naturalWidth, 1)
      const heightScale = availableHeight / Math.max(naturalHeight, 1)
      const nextScale = Math.min(1, widthScale, heightScale)
      const clampedScale = Math.max(nextScale, 0.1)

      setFitScale(clampedScale)
      setScaledSize({
        width: Math.ceil(naturalWidth * clampedScale),
        height: Math.ceil(naturalHeight * clampedScale)
      })
    }

    const frame = window.requestAnimationFrame(applyFitScale)
    window.addEventListener('resize', applyFitScale)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', applyFitScale)
    }
  }, [treeData, loading])

  return (
    <div className="org-chart-page">
      <div className="org-chart-header">
        <div>
          <h1>Organisation Structure</h1>
          <p>Employee hierarchy based on reporting manager relationships</p>
        </div>
      </div>

      <div className="org-chart-stats">
        <div className="org-stat-card">
          <span>Total Users</span>
          <strong>{totalUsers}</strong>
        </div>
        <div className="org-stat-card">
          <span>Root Managers</span>
          <strong>{totalRoots}</strong>
        </div>
        <div className="org-stat-card">
          <span>Showing</span>
          <strong>{searchQuery.trim() ? 'Filtered' : 'All'}</strong>
        </div>
      </div>

      <div className="org-chart-toolbar">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search employee, designation, department, or branch"
        />
      </div>

      {loading ? (
        <div className="org-chart-empty">Loading organisation chart...</div>
      ) : treeData.length === 0 ? (
        <div className="org-chart-empty">No users found for the current filter.</div>
      ) : (
        <div className="org-tree-shell" ref={shellRef}>
          <div
            className="org-tree-fit-stage"
            style={{
              width: scaledSize.width ? `${scaledSize.width}px` : '100%',
              height: scaledSize.height ? `${scaledSize.height}px` : '100%'
            }}
          >
            <div
              className="org-tree-fit-content"
              ref={treeRef}
              style={{ transform: `scale(${fitScale})` }}
            >
              <ul className="org-tree-root">
                {treeData.map(node => (
                  <TreeNode
                    key={node.id}
                    node={node}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrgChart
