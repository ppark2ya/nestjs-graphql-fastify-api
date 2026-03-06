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

export const SERVICE_LOG_SUBSCRIPTION = gql`
  subscription ServiceLog($serviceName: String!) {
    serviceLog(serviceName: $serviceName) {
      containerId
      serviceName
      timestamp
      message
      stream
      event
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

export interface ServiceLogEntry extends LogEntry {
  serviceName: string;
  event?: string | null;
}

export interface ServiceGroup {
  serviceName: string;
  containers: Container[];
}

export type LiveStreamTabData =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup };

export interface ContainerStatsData {
  id: string;
  name: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
}

export const CONTAINER_STATS_QUERY = gql`
  query ContainerStats {
    containerStats {
      id
      name
      cpuPercent
      memUsage
      memLimit
    }
  }
`;
