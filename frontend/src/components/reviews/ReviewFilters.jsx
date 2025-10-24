import React, { useState } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Button,
  Menu,
  MenuItem,
  Chip,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  useTheme,
  useMediaQuery,
  IconButton,
  Drawer
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

/**
 * ReviewFilters Component
 * Provides filtering, sorting, and search functionality for reviews
 */
const ReviewFilters = ({ 
  filters, 
  onFilterChange, 
  onSearch,
  eventOptions = [],
  userOptions = []
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchText, setSearchText] = useState(filters.searchText || '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advancedMenuAnchor, setAdvancedMenuAnchor] = useState(null);

  // Status tab configuration
  const statusTabs = [
    { label: 'All', value: null },
    { label: 'Pending', value: 'pending' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Escalated', value: 'escalated' }
  ];

  const handleStatusChange = (event, newValue) => {
    onFilterChange({
      ...filters,
      status: newValue ? [newValue] : null
    });
  };

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchText(value);
    
    // Debounced search
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onSearch(value);
    }, 500);
  };

  let searchTimeout;

  const handleClearSearch = () => {
    setSearchText('');
    onSearch('');
  };

  const handlePriorityChange = (event) => {
    const value = event.target.value;
    onFilterChange({
      ...filters,
      priority: value.length > 0 ? value : null
    });
  };

  const handleRoleChange = (event) => {
    const value = event.target.value;
    onFilterChange({
      ...filters,
      reviewerRole: value.length > 0 ? value : null
    });
  };

  const handleEventChange = (event) => {
    onFilterChange({
      ...filters,
      eventId: event.target.value || null
    });
  };

  const handleAssigneeChange = (event) => {
    onFilterChange({
      ...filters,
      assignedTo: event.target.value || null
    });
  };

  const handleClearFilters = () => {
    setSearchText('');
    onFilterChange({
      status: null,
      priority: null,
      reviewerRole: null,
      eventId: null,
      assignedTo: null,
      searchText: null
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.priority?.length > 0) count++;
    if (filters.reviewerRole?.length > 0) count++;
    if (filters.eventId) count++;
    if (filters.assignedTo) count++;
    if (filters.searchText) count++;
    return count;
  };

  const advancedFiltersContent = (
    <Box sx={{ p: isMobile ? 2 : 0, minWidth: isMobile ? 'auto' : 300 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Priority Filter */}
        <FormControl fullWidth size="small">
          <InputLabel>Priority</InputLabel>
          <Select
            multiple
            value={filters.priority || []}
            onChange={handlePriorityChange}
            input={<OutlinedInput label="Priority" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="urgent">Urgent</MenuItem>
          </Select>
        </FormControl>

        {/* Role Filter */}
        <FormControl fullWidth size="small">
          <InputLabel>Reviewer Role</InputLabel>
          <Select
            multiple
            value={filters.reviewerRole || []}
            onChange={handleRoleChange}
            input={<OutlinedInput label="Reviewer Role" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="editor">Editor</MenuItem>
            <MenuItem value="client">Client</MenuItem>
          </Select>
        </FormControl>

        {/* Event Filter */}
        {eventOptions.length > 0 && (
          <FormControl fullWidth size="small">
            <InputLabel>Event</InputLabel>
            <Select
              value={filters.eventId || ''}
              onChange={handleEventChange}
              label="Event"
            >
              <MenuItem value="">All Events</MenuItem>
              {eventOptions.map((event) => (
                <MenuItem key={event.id} value={event.id}>
                  {event.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Assignee Filter */}
        {userOptions.length > 0 && (
          <FormControl fullWidth size="small">
            <InputLabel>Assigned To</InputLabel>
            <Select
              value={filters.assignedTo || ''}
              onChange={handleAssigneeChange}
              label="Assigned To"
            >
              <MenuItem value="">All Users</MenuItem>
              {userOptions.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Clear Filters Button */}
        <Button
          variant="outlined"
          onClick={handleClearFilters}
          startIcon={<ClearIcon />}
          fullWidth
        >
          Clear All Filters
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ mb: 3 }}>
      {/* Search Bar */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search reviews..."
          value={searchText}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchText && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      </Box>

      {/* Status Tabs and Filter Button */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2,
          flexDirection: isMobile ? 'column' : 'row',
          width: '100%'
        }}
      >
        <Tabs
          value={filters.status?.[0] || null}
          onChange={handleStatusChange}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons={isMobile ? 'auto' : false}
          sx={{ flexGrow: 1 }}
        >
          {statusTabs.map((tab) => (
            <Tab key={tab.label} label={tab.label} value={tab.value} />
          ))}
        </Tabs>

        {/* Advanced Filters Button/Drawer */}
        {isMobile ? (
          <>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={() => setDrawerOpen(true)}
              fullWidth={isMobile}
              sx={{ minWidth: isMobile ? '100%' : 'auto' }}
            >
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Button>
            <Drawer
              anchor="bottom"
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            >
              {advancedFiltersContent}
            </Drawer>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={(e) => setAdvancedMenuAnchor(e.currentTarget)}
            >
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Button>
            <Menu
              anchorEl={advancedMenuAnchor}
              open={Boolean(advancedMenuAnchor)}
              onClose={() => setAdvancedMenuAnchor(null)}
            >
              <Box sx={{ p: 2 }}>
                {advancedFiltersContent}
              </Box>
            </Menu>
          </>
        )}
      </Box>

      {/* Active Filters Display */}
      {getActiveFilterCount() > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
          {filters.priority?.map((p) => (
            <Chip
              key={p}
              label={`Priority: ${p}`}
              size="small"
              onDelete={() => handlePriorityChange({ 
                target: { value: filters.priority.filter(x => x !== p) } 
              })}
            />
          ))}
          {filters.reviewerRole?.map((r) => (
            <Chip
              key={r}
              label={`Role: ${r}`}
              size="small"
              onDelete={() => handleRoleChange({ 
                target: { value: filters.reviewerRole.filter(x => x !== r) } 
              })}
            />
          ))}
          {filters.eventId && (
            <Chip
              label="Event Filter Active"
              size="small"
              onDelete={() => handleEventChange({ target: { value: '' } })}
            />
          )}
          {filters.assignedTo && (
            <Chip
              label="Assignee Filter Active"
              size="small"
              onDelete={() => handleAssigneeChange({ target: { value: '' } })}
            />
          )}
        </Box>
      )}
    </Box>
  );
};

export default ReviewFilters;
