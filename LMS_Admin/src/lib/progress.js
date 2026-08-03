import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './api';

export const progressKeys = {
  me: ['progress', 'me'],
  student: (id) => ['progress', 'student', id],
  studentSubmissions: (id) => ['progress', 'student', id, 'submissions'],
};

/** The signed-in student's curriculum progression. */
export function useMyProgress({ enabled = true } = {}) {
  return useQuery({
    queryKey: progressKeys.me,
    queryFn: () => unwrap(api.get('/progress/me')),
    enabled,
  });
}

/** Admin/trainer: a specific student's progression. */
export function useStudentProgress(studentId) {
  return useQuery({
    queryKey: progressKeys.student(studentId),
    queryFn: () => unwrap(api.get(`/progress/student/${studentId}`)),
    enabled: Boolean(studentId),
  });
}

/** Admin/trainer: the assessments a student has attempted (submitted / graded). */
export function useStudentSubmissions(studentId) {
  return useQuery({
    queryKey: progressKeys.studentSubmissions(studentId),
    queryFn: () => unwrap(api.get(`/progress/student/${studentId}/submissions`)),
    enabled: Boolean(studentId),
  });
}
