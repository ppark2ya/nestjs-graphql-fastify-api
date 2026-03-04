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
      serviceName
      taskSlot
      nodeName
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
  serviceName?: string;
  taskSlot?: string;
  nodeName?: string;
}

export interface LogEntry {
  containerId: string;
  timestamp: string;
  message: string;
  stream: string;
}

export interface ServiceGroup {
  serviceName: string;
  containers: Container[];
}

export type LiveStreamTabData =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup };
