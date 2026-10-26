import React from 'react';
import { TeacherAIAssistant, TeacherAIAssistantProps } from './TeacherAIAssistant';

export interface AIAssistantModalProps extends TeacherAIAssistantProps {}

/**
 * AIAssistantModal wraps the TeacherAIAssistant component
 * (Trợ lý ảo AI do Thầy Vũ Văn Hùng trực tiếp phát triển).
 */
export const AIAssistantModal: React.FC<AIAssistantModalProps> = (props) => {
  return <TeacherAIAssistant {...props} />;
};

export { TeacherAIAssistant };
