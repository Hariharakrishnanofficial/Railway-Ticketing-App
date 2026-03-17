import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import api from '../services/api';
import PropTypes from 'prop-types';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);

        const response = await api.get('/settings?limit=200');

        if (response.data.success) {
          const settingsData = response.data.data.data;
          const parsedSettings = parseSettings(settingsData);
          setSettings(parsedSettings);
        } else {
          throw new Error(response.data.error || 'Failed to fetch settings');
        }

      } catch (err) {
        setError(err.message);
        console.error("Error fetching settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const parseSettings = (settingsArray) => {
    const settingsMap = {};

    settingsArray.forEach(setting => {
      const key = setting.Key;
      const value = setting.Value;

      if (key && value) {
        if (key.startsWith('dropdown_')) {
          settingsMap[key] = value.split(',').map(item => item.trim());
        } else {
          settingsMap[key] = value;
        }
      }
    });

    return settingsMap;
  };

  const getSetting = (key, defaultValue = null) => {
    return settings[key] || defaultValue;
  };

  const getDropdownOptions = (key) => {
    const options = settings[key];

    if (Array.isArray(options)) {
      return options.map(option => ({
        value: option,
        label: option
      }));
    }

    return [];
  };

  const value = useMemo(() => ({
    settings,
    loading,
    error,
    getSetting,
    getDropdownOptions
  }), [settings, loading, error]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

SettingsProvider.propTypes = {
  children: PropTypes.node.isRequired
};