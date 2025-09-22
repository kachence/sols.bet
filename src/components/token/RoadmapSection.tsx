// src/components/token/RoadmapSection.tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRoad, faCheckCircle, faClock, faHourglass, faRocket, faGamepad, faExchangeAlt, faUsers, faChartLine, faMobile } from '@fortawesome/free-solid-svg-icons';

export function RoadmapSection() {
  const roadmapItems = [
    {
      quarter: "Q1 2025",
      title: "Backend Foundation",
      status: "completed",
      icon: faRocket,
      items: [
        { text: "Smart Contract Development", completed: true },
        { text: "Unit & Integration Tests", completed: true },
        { text: "Platform Beta Launch", completed: true },
        { text: "Backend Infrastructure Foundation", completed: true }
      ]
    },
    {
      quarter: "Q2 2025", 
      title: "Platform Completion",
      status: "completed",
      icon: faExchangeAlt,
      items: [
        { text: "Frontend Development", completed: true },
        { text: "Casino Games Integration", completed: true },
        { text: "Monitoring & Alert System Development", completed: true },
        { text: "Security & Stress Test Execution", completed: true }
      ]
    },
    {
      quarter: "Q3 2025",
      title: "Token Launch & Ecosystem",
      status: "active",
      icon: faGamepad,
      items: [
        { text: "Official Website Launch", completed: true },
        { text: "Devnet Launch & Testing", completed: true },
        { text: "$SOLS Token Launch", completed: false },
        { text: "Airdrop Season 1", completed: false }
      ]
    },
    {
      quarter: "Q4 2025",
      title: "Platform Expansion",
      status: "planned", 
      icon: faChartLine,
      items: [
        { text: "Buyback & Burn Mechanism", completed: false },
        { text: "$SOLS Token Integration", completed: false },
        { text: "In-House Game Development", completed: false },
        { text: "Airdrop Season 2", completed: false }
      ]
    },
    {
      quarter: "Q1 2026",
      title: "Global Scale",
      status: "planned",
      icon: faMobile,
      items: [
        { text: "Welcome Bonus Program", completed: false },
        { text: "Regulatory Compliance", completed: false },
        { text: "Game Provider Partnerships", completed: false },
        { text: "Airdrop Season 3", completed: false }
      ]
    },
    {
      quarter: "Q2 2026",
      title: "Innovation Hub",
      status: "planned",
      icon: faUsers,
      items: [
        { text: "CEX Listings", completed: false },
        { text: "Source Code Release", completed: false },
        { text: "Cross Chain Expansion", completed: false },
        { text: "Airdrop Season 4", completed: false }
      ]
    }
  ];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "completed":
        return {
          color: "text-richGold",
          bgColor: "bg-richGold/20",
          borderColor: "border-richGold",
          icon: faCheckCircle
        };
      case "active":
        return {
          color: "text-richGold",
          bgColor: "bg-yellow-500/20",
          borderColor: "border-richGold",
          icon: faClock
        };
      case "upcoming":
        return {
          color: "text-blue-400",
          bgColor: "bg-blue-500/20",
          borderColor: "border-blue-400",
          icon: faHourglass
        };
      case "planned":
        return {
          color: "text-gray-400",
          bgColor: "bg-gray-500/20",
          borderColor: "border-gray-400",
          icon: faHourglass
        };
      default:
        return {
          color: "text-gray-400",
          bgColor: "bg-gray-500/20",
          borderColor: "border-gray-400",
          icon: faHourglass
        };
    }
  };

  return (
    <section className="bg-cardMedium border border-cardMedium rounded-lg p-6 relative z-10">
      <div className="flex items-center gap-3 mb-6">
        <FontAwesomeIcon 
          icon={faRoad} 
          className="text-richGold w-8 h-8" 
          style={{ fontSize: '32px' }}
        />
        <h2 className="text-3xl font-bold font-heading text-white">Roadmap</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {roadmapItems.map((item, index) => {
          const statusConfig = getStatusConfig(item.status);
          const completedTasks = item.items.filter(task => task.completed).length;
          const progressPercentage = (completedTasks / item.items.length) * 100;

          return (
            <div key={index} className="bg-darkLuxuryPurple rounded-lg p-6 hover:bg-darkLuxuryPurple/80 transition-colors duration-200 relative overflow-hidden">
              {/* Status indicator */}
              <div className={`absolute top-4 right-4 w-3 h-3 rounded-full ${statusConfig.bgColor} border-2 ${statusConfig.borderColor}`}></div>
              
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-lg ${statusConfig.bgColor} flex items-center justify-center`}>
                  <FontAwesomeIcon 
                    icon={item.icon} 
                    className="text-richGold w-6 h-6" 
                    style={{ fontSize: '24px' }}
                  />
                </div>
                <div>
                  <div className="text-richGold font-bold text-sm">{item.quarter}</div>
                  <h3 className="text-lg font-bold text-white">{item.title}</h3>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Progress</span>
                  <span className="text-xs text-gray-400">{completedTasks}/{item.items.length}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${
                      item.status === 'completed' ? 'bg-richGold' :
                      item.status === 'active' ? 'bg-richGold' :
                      item.status === 'upcoming' ? 'bg-blue-400' : 'bg-gray-500'
                    }`}
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
              </div>

              {/* Tasks */}
              <div className="space-y-2">
                {item.items.map((task, taskIndex) => (
                  <div key={taskIndex} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.completed ? 'bg-richGold' : 'bg-gray-500'
                    }`}></div>
                    <span className={`text-sm ${
                      task.completed ? 'text-richGold line-through' : 'text-gray-300'
                    }`}>
                      {task.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Status Badge */}
              <div className="mt-4 pt-4 border-t border-cardDivider">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${statusConfig.bgColor} ${statusConfig.color}`}>
                  <FontAwesomeIcon 
                    icon={statusConfig.icon} 
                    className="w-3 h-3 mr-1" 
                    style={{ fontSize: '12px' }}
                  />
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
} 