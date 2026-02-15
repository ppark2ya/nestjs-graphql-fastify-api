import { gql } from '@apollo/client';

export const CONTAINERS_QUERY = gql`
  query Containers {
    containers {
      id
      name
      image
      status
      state
      created
      ports
    }
  }
`;

export const CONTAINER_LOG_SUBSCRIPTION = gql`
  subscription ContainerLog($containerId: String!) {
    containerLog(containerId: $containerId) {
      containerId
      timestamp
      message
      stream
    }
  }
`;

export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: number;
  ports: string[];
}

export interface LogEntry {
  containerId: string;
  timestamp: string;
  message: string;
  stream: string;
}
