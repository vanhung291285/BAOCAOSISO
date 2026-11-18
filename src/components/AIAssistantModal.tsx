import React from 'react';
import { TeacherAIAssistant, TeacherAIAssistantProps } from './TeacherAIAssistant';

export interface AIAssistantModalProps extends TeacherAIAssistantProps {}

/**
 * AIAssistantModal wraps the TeacherAIAssistant component
 * (Trợ lý AI nhà trường).
 */
export const AIAssistantModal: React.FC<AIAssistantModalProps> = (props) => {
  return <TeacherAIAssistant {...props} />;
};

export { TeacherAIAssistant };
