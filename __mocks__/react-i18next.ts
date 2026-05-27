export const useTranslation = () => ({
  t: (key: string) => key,
  i18n: { changeLanguage: () => Promise.resolve() },
});

export const Trans: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  children as React.ReactElement;
